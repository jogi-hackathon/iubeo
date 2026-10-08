// Command loadtest は IUBEO のバックエンドに WebSocket で負荷をかけ、
// プレイヤーが体感するレイテンシ(RTT)と、配信間隔のばらつきを測る。
//
// Fargate の x86_64 と ARM64(Graviton)を同じ条件で比べるために使う。
// 測るもの:
//
//	RTT        自分の transform を送ってから、その transform が配信で戻ってくるまで。
//	           サーバーの 1 tick(最大 50ms)を含むが、両方の構成で同じ条件なので比較に使える
//	配信間隔     transforms が届く間隔。20Hz なら 50ms。CPU が足りないとここが伸びる・ばらつく
//
// 実行例:
//
//	go run ./cmd/loadtest -url http://localhost:8080 -clients 30 -duration 20s -label local-arm64 -out /tmp/arm64.json
//
// 2 つの結果を SVG の比較チャートにする:
//
//	go run ./cmd/loadtest -compare /tmp/x86.json,/tmp/arm.json -labels x86_64,arm64 -out /tmp/compare.svg
package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

// result は 1 回の測定結果。比較チャートはこの JSON を読む
type result struct {
	Label          string    `json:"label"`
	URL            string    `json:"url"`
	Clients        int       `json:"clients"`
	MatchSize      int       `json:"match_size"`
	Hz             int       `json:"hz"`
	DurationS      float64   `json:"duration_s"`
	WarmupS        float64   `json:"warmup_s"`
	StartedAt      time.Time `json:"started_at"`
	RTTMs          stats     `json:"rtt_ms"`
	TickIntervalMs stats     `json:"tick_interval_ms"`
	Messages       int64     `json:"messages"`
	MessagesPerSec float64   `json:"messages_per_sec"`
	Disconnects    int64     `json:"disconnects"`
	// Binary は位置のメッセージをバイナリでやり取りした(-binary)
	Binary bool `json:"binary"`
	// 1 クライアントあたりの、TCP の上でやり取りしたバイト数(WebSocket のヘッダ込み。TCP/IP・TLS のヘッダは含まない)
	WireRxBytesPerClientPerSec float64 `json:"wire_rx_bytes_per_client_per_sec"`
	WireTxBytesPerClientPerSec float64 `json:"wire_tx_bytes_per_client_per_sec"`
	// 1 クライアントあたりの送受信のペイロード(WebSocket のフレームの中身。ヘッダは含まない)
	RxBytesPerClientPerSec float64  `json:"rx_bytes_per_client_per_sec"`
	TxBytesPerClientPerSec float64  `json:"tx_bytes_per_client_per_sec"`
	Errors                 []string `json:"errors,omitempty"`
}

type stats struct {
	Count int     `json:"count"`
	Mean  float64 `json:"mean"`
	P50   float64 `json:"p50"`
	P95   float64 `json:"p95"`
	P99   float64 `json:"p99"`
	Max   float64 `json:"max"`
}

type options struct {
	baseURL   string
	origin    string
	clients   int
	matchSize int
	hz        int
	duration  time.Duration
	warmup    time.Duration
	label     string
	out       string
	binary    bool
}

// collector は全クライアントのサンプルを集める
type collector struct {
	mu           sync.Mutex
	rtt          []float64
	tick         []float64
	messages     int64
	disconnects  int64
	rxBytes      int64
	txBytes      int64
	wireRx       atomic.Int64
	wireTx       atomic.Int64
	measuring    atomic.Bool
	errs         []string
	measuringEnd time.Time
}

func (c *collector) addRTT(ms float64) {
	c.mu.Lock()
	if time.Now().Before(c.measuringEnd) {
		c.rtt = append(c.rtt, ms)
	}
	c.mu.Unlock()
}

func (c *collector) addTick(ms float64) {
	c.mu.Lock()
	// 配信数も測定時間の中だけ数える(助走の分まで数えると、測定時間で割ったときに実際より多く出る)
	if time.Now().Before(c.measuringEnd) {
		c.tick = append(c.tick, ms)
		c.messages++
	}
	c.mu.Unlock()
}

// addBytes は測定時間の中の送受信量を数える
func (c *collector) addBytes(rx, tx int) {
	c.mu.Lock()
	if time.Now().Before(c.measuringEnd) {
		c.rxBytes += int64(rx)
		c.txBytes += int64(tx)
	}
	c.mu.Unlock()
}

func (c *collector) fail(format string, args ...any) {
	c.mu.Lock()
	if len(c.errs) < 20 {
		c.errs = append(c.errs, fmt.Sprintf(format, args...))
	}
	c.mu.Unlock()
}

func (c *collector) disconnected() {
	c.mu.Lock()
	c.disconnects++
	c.mu.Unlock()
}

func main() {
	var (
		compare = flag.String("compare", "", "結果 JSON をカンマ区切りで指定し、負荷試験ではなく比較チャートを描く")
		labels  = flag.String("labels", "", "-compare のラベルをカンマ区切りで指定(既定はファイル名)")
		title   = flag.String("title", "Fargate x86_64 vs ARM64 (Graviton)", "比較チャートの見出し")

		baseURL   = flag.String("url", "", "対象の URL(例 http://localhost:8080)")
		origin    = flag.String("origin", "http://localhost:5173", "Origin ヘッダ。サーバーの IUBEO_ALLOWED_ORIGINS に含まれる必要がある")
		clients   = flag.Int("clients", 30, "同時 WebSocket クライアント数(match の倍数に切り下げる)")
		matchSize = flag.Int("match", 3, "1 セッションの人数。サーバーの IUBEO_MATCH_SIZE と合わせる")
		hz        = flag.Int("hz", 20, "1 クライアントが transform を送る回数/秒")
		duration  = flag.Duration("duration", 20*time.Second, "測定時間")
		warmup    = flag.Duration("warmup", 3*time.Second, "測定から除く助走時間")
		label     = flag.String("label", "", "この測定の名前(比較チャートのラベルになる)")
		out       = flag.String("out", "", "結果 JSON の出力先。省略すると標準出力に要約だけ出す")
		bin       = flag.Bool("binary", false, "位置のメッセージ(transform / transforms)をバイナリでやり取りする(WebSocket の URL に enc=bin を付ける。フロントと同じ)")
	)
	flag.Parse()

	if *compare != "" {
		files := splitList(*compare)
		names := splitList(*labels)
		if len(files) < 2 {
			fatal(errors.New("-compare には 2 つ以上のファイルを指定する"))
		}
		if err := renderCompare(files, names, *title, *out); err != nil {
			fatal(err)
		}
		return
	}

	if *baseURL == "" {
		fatal(errors.New("-url は必須"))
	}
	if *clients < *matchSize || *matchSize < 1 {
		fatal(fmt.Errorf("-clients は -match(%d) 以上にする", *matchSize))
	}

	opts := options{
		baseURL:   strings.TrimRight(*baseURL, "/"),
		origin:    *origin,
		clients:   *clients - *clients%*matchSize,
		matchSize: *matchSize,
		hz:        *hz,
		duration:  *duration,
		warmup:    *warmup,
		label:     *label,
		out:       *out,
		binary:    *bin,
	}
	res, err := run(opts)
	if err != nil {
		fatal(err)
	}
	printSummary(res)
	if *out != "" {
		if err := writeJSON(*out, res); err != nil {
			fatal(err)
		}
		fmt.Printf("\n結果を %s に書いた\n", *out)
	}
}

func splitList(s string) []string {
	var out []string
	for _, v := range strings.Split(s, ",") {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "loadtest:", err)
	os.Exit(1)
}

func run(opts options) (*result, error) {
	ctx, cancel := context.WithTimeout(context.Background(), opts.warmup+opts.duration+2*time.Minute)
	defer cancel()
	// 測定が終わったらクライアントを止める(止めないと、全体の期限まで待つことになる)
	clientCtx, stopClients := context.WithCancel(ctx)
	defer stopClients()

	c := &collector{}
	fmt.Printf("接続中: %d クライアント (%d 人 × %d セッション) → %s\n",
		opts.clients, opts.matchSize, opts.clients/opts.matchSize, opts.baseURL)

	ready := make(chan struct{}, opts.clients)
	var wg sync.WaitGroup
	for i := range opts.clients {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			if err := runClient(clientCtx, opts, c, ready); err != nil {
				c.fail("client %d: %v", n, err)
				ready <- struct{}{} // 待ち続けない
			}
		}(i)
	}

	// 全員が WebSocket につながるまで待つ(マッチング待ちを含む)
	deadline := time.After(opts.warmup + opts.duration + 60*time.Second)
	for range opts.clients {
		select {
		case <-ready:
		case <-deadline:
			return nil, errors.New("クライアントの接続がタイムアウトした")
		}
	}

	fmt.Printf("全員接続。%s 助走してから %s 測る\n", opts.warmup, opts.duration)
	time.Sleep(opts.warmup)
	c.measuringEnd = time.Now().Add(opts.duration)
	started := time.Now()
	c.measuring.Store(true)
	time.Sleep(opts.duration)
	c.measuring.Store(false)
	elapsed := time.Since(started)

	stopClients()
	wg.Wait()

	c.mu.Lock()
	defer c.mu.Unlock()
	res := &result{
		Label:                      opts.label,
		URL:                        opts.baseURL,
		Clients:                    opts.clients,
		MatchSize:                  opts.matchSize,
		Hz:                         opts.hz,
		DurationS:                  elapsed.Seconds(),
		WarmupS:                    opts.warmup.Seconds(),
		StartedAt:                  started,
		RTTMs:                      summarize(c.rtt),
		TickIntervalMs:             summarize(c.tick),
		Messages:                   c.messages,
		MessagesPerSec:             float64(c.messages) / elapsed.Seconds(),
		Disconnects:                c.disconnects,
		Binary:                     opts.binary,
		WireRxBytesPerClientPerSec: float64(c.wireRx.Load()) / float64(opts.clients) / elapsed.Seconds(),
		WireTxBytesPerClientPerSec: float64(c.wireTx.Load()) / float64(opts.clients) / elapsed.Seconds(),
		RxBytesPerClientPerSec:     float64(c.rxBytes) / float64(opts.clients) / elapsed.Seconds(),
		TxBytesPerClientPerSec:     float64(c.txBytes) / float64(opts.clients) / elapsed.Seconds(),
		Errors:                     c.errs,
	}
	return res, nil
}

// runClient は 1 人分。プレイヤーを作り、マッチングに並び、WebSocket で送受信する
func runClient(ctx context.Context, opts options, c *collector, ready chan<- struct{}) error {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return err
	}
	httpClient := &http.Client{Jar: jar, Timeout: 15 * time.Second}

	playerID, err := createPlayer(ctx, httpClient, opts.baseURL)
	if err != nil {
		return err
	}
	sessionID, err := joinMatchmaking(ctx, httpClient, opts.baseURL)
	if err != nil {
		return err
	}

	wsURL := "ws" + strings.TrimPrefix(opts.baseURL, "http") +
		"/api/v1/sessions/" + sessionID + "/ws"
	if opts.binary {
		wsURL += "?enc=bin"
	}
	// 実際に TCP でやり取りした量を数えるため、接続を包む
	dialer := &net.Dialer{}
	wsHTTP := &http.Client{Jar: jar, Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			nc, err := dialer.DialContext(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &countingConn{Conn: nc, c: c}, nil
		},
	}}
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPClient: wsHTTP,
		HTTPHeader: http.Header{"Origin": []string{opts.origin}},
	})
	if err != nil {
		return fmt.Errorf("WebSocket に接続できない: %w", err)
	}
	defer func() { _ = conn.CloseNow() }()
	conn.SetReadLimit(1 << 20)

	// 送信した seq → 送信時刻。自分の transform が配信で戻ってきたら RTT を出す
	var (
		mu      sync.Mutex
		pending = map[int64]time.Time{}
	)

	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		var last time.Time
		// バイナリの transforms はプレイヤーを席で表すので、snapshot(JSON)で自分の席を知っておく
		mySeat := -1
		for {
			typ, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			c.addBytes(len(data), 0)
			if typ == websocket.MessageBinary {
				// type=2 | serverTime f64 | n u8 | n × (seat u8 | seq u32 | f32 × 5)(backend/internal/session/binary.go)
				if len(data) < 10 || data[0] != 2 {
					continue
				}
				now := time.Now()
				if !last.IsZero() {
					c.addTick(float64(now.Sub(last).Microseconds()) / 1000)
				}
				last = now
				n := int(data[9])
				for i := 0; i < n && 10+(i+1)*25 <= len(data); i++ {
					off := 10 + i*25
					if int(data[off]) != mySeat {
						continue
					}
					seq := int64(binary.LittleEndian.Uint32(data[off+1:]))
					mu.Lock()
					sent, ok := pending[seq]
					delete(pending, seq)
					mu.Unlock()
					if ok {
						c.addRTT(float64(now.Sub(sent).Microseconds()) / 1000)
					}
				}
				continue
			}
			if mySeat < 0 {
				var snap struct {
					Type    string `json:"type"`
					Session struct {
						Players []struct {
							PlayerId string `json:"playerId"`
							Seat     int    `json:"seat"`
						} `json:"players"`
					} `json:"session"`
				}
				if json.Unmarshal(data, &snap) == nil && snap.Type == "snapshot" {
					for _, p := range snap.Session.Players {
						if p.PlayerId == playerID {
							mySeat = p.Seat
						}
					}
				}
			}
			var msg struct {
				Type    string `json:"type"`
				Players []struct {
					PlayerId  string `json:"playerId"`
					Transform struct {
						Seq int64 `json:"seq"`
					} `json:"transform"`
				} `json:"players"`
			}
			if json.Unmarshal(data, &msg) != nil || msg.Type != "transforms" {
				continue
			}
			now := time.Now()
			if !last.IsZero() {
				c.addTick(float64(now.Sub(last).Microseconds()) / 1000)
			}
			last = now
			for _, p := range msg.Players {
				if p.PlayerId != playerID {
					continue
				}
				mu.Lock()
				sent, ok := pending[p.Transform.Seq]
				delete(pending, p.Transform.Seq)
				mu.Unlock()
				if ok {
					c.addRTT(float64(now.Sub(sent).Microseconds()) / 1000)
				}
			}
		}
	}()

	ready <- struct{}{}

	interval := time.Second / time.Duration(opts.hz)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	var seq int64
	// 実際のプレイヤーに近い動き: クライアントごとに位相をずらした円を歩き、進行方向を向き、上下も少し見回す。
	// 値が毎回変わるので、圧縮の効き方も実際に近くなる(位置が固定だと、圧縮がよく効きすぎる)
	phase := rand.Float64() * 2 * math.Pi
	cx, cz := rand.Float64()*20-10, rand.Float64()*20-10
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-readDone:
			// 測定の終わりに止めたときも読み取りは終わるので、切断として数えない
			if ctx.Err() != nil {
				return nil
			}
			c.disconnected()
			return errors.New("サーバーから切断された")
		case <-ticker.C:
			seq++
			t := float64(seq) / float64(opts.hz)
			a := phase + t*0.8 // 半径 3 m を 2.4 m/秒で歩く
			px, pz := cx+3*math.Cos(a), cz+3*math.Sin(a)
			yaw := a + math.Pi/2
			pitch := 0.2 * math.Sin(t*0.5)
			var body []byte
			typ := websocket.MessageText
			if opts.binary {
				// type=1 | seq u32 | x y z f32 | yaw f32 | pitch f32
				body = make([]byte, 25)
				body[0] = 1
				binary.LittleEndian.PutUint32(body[1:], uint32(seq))
				for i, v := range []float64{px, 0, pz, yaw, pitch} {
					binary.LittleEndian.PutUint32(body[5+i*4:], math.Float32bits(float32(v)))
				}
				typ = websocket.MessageBinary
			} else {
				var err error
				body, err = json.Marshal(map[string]any{
					"type":     "transform",
					"position": []float64{px, 0, pz},
					"yaw":      yaw,
					"pitch":    pitch,
					"seq":      seq,
				})
				if err != nil {
					return err
				}
			}
			c.addBytes(0, len(body))
			mu.Lock()
			pending[seq] = time.Now()
			// 戻ってこない seq を溜め込まないよう、古いものは捨てる
			for s := range pending {
				if s < seq-100 {
					delete(pending, s)
				}
			}
			mu.Unlock()

			wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(wctx, typ, body)
			cancel()
			if err != nil {
				if ctx.Err() != nil {
					return nil
				}
				return fmt.Errorf("送信に失敗: %w", err)
			}
		}
	}
}

// countingConn は、測定時間の中で TCP の上を通ったバイト数を数える
type countingConn struct {
	net.Conn
	c *collector
}

func (cc *countingConn) Read(p []byte) (int, error) {
	n, err := cc.Conn.Read(p)
	if cc.c.measuring.Load() {
		cc.c.wireRx.Add(int64(n))
	}
	return n, err
}

func (cc *countingConn) Write(p []byte) (int, error) {
	n, err := cc.Conn.Write(p)
	if cc.c.measuring.Load() {
		cc.c.wireTx.Add(int64(n))
	}
	return n, err
}

func createPlayer(ctx context.Context, client *http.Client, baseURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/v1/players", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("プレイヤーを作れない: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("プレイヤー作成が %s", resp.Status)
	}
	var me struct {
		PlayerId string `json:"playerId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&me); err != nil {
		return "", err
	}
	if me.PlayerId == "" {
		return "", errors.New("playerId が空")
	}
	return me.PlayerId, nil
}

// joinMatchmaking は待機列に入り、成立するまで(1秒間隔で)ポーリングする
func joinMatchmaking(ctx context.Context, client *http.Client, baseURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/v1/matchmaking", bytes.NewReader(nil))
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("マッチングに参加できない: %w", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("マッチング参加が %s", resp.Status)
	}

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/matchmaking", nil)
		if err != nil {
			return "", err
		}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		var st struct {
			Status    string `json:"status"`
			SessionId string `json:"sessionId"`
		}
		err = json.NewDecoder(resp.Body).Decode(&st)
		_ = resp.Body.Close()
		if err != nil {
			return "", err
		}
		if st.Status == "matched" && st.SessionId != "" {
			return st.SessionId, nil
		}
	}
}

func summarize(samples []float64) stats {
	if len(samples) == 0 {
		return stats{}
	}
	sorted := append([]float64(nil), samples...)
	sort.Float64s(sorted)
	var sum float64
	for _, v := range sorted {
		sum += v
	}
	return stats{
		Count: len(sorted),
		Mean:  sum / float64(len(sorted)),
		P50:   percentile(sorted, 50),
		P95:   percentile(sorted, 95),
		P99:   percentile(sorted, 99),
		Max:   sorted[len(sorted)-1],
	}
}

// percentile は線形補間で分位点を求める(sorted は昇順であること)
func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	pos := p / 100 * float64(len(sorted)-1)
	lo := int(math.Floor(pos))
	hi := min(lo+1, len(sorted)-1)
	return sorted[lo] + (sorted[hi]-sorted[lo])*(pos-float64(lo))
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func printSummary(r *result) {
	fmt.Printf("\n=== %s ===\n", cmp(r.Label != "", r.Label, r.URL))
	fmt.Printf("クライアント %d  セッション %d  送信 %d Hz  %0.1f 秒\n",
		r.Clients, r.Clients/r.MatchSize, r.Hz, r.DurationS)
	fmt.Printf("配信 %d 通 (%.0f 通/秒)  切断 %d\n", r.Messages, r.MessagesPerSec, r.Disconnects)
	fmt.Printf("1 クライアントあたり 受信 %.0f B/秒  送信 %.0f B/秒(ペイロード、binary=%v)\n", r.RxBytesPerClientPerSec, r.TxBytesPerClientPerSec, r.Binary)
	fmt.Printf("1 クライアントあたり 回線 受信 %.0f B/秒  送信 %.0f B/秒(TCP の上、WebSocket ヘッダ込み)\n", r.WireRxBytesPerClientPerSec, r.WireTxBytesPerClientPerSec)
	fmt.Printf("%-16s %7s %7s %7s %7s %7s\n", "", "n", "p50", "p95", "p99", "max")
	fmt.Printf("%-16s %7d %7.1f %7.1f %7.1f %7.1f  ms\n", "RTT", r.RTTMs.Count, r.RTTMs.P50, r.RTTMs.P95, r.RTTMs.P99, r.RTTMs.Max)
	fmt.Printf("%-16s %7d %7.1f %7.1f %7.1f %7.1f  ms\n", "配信間隔(目標50)", r.TickIntervalMs.Count, r.TickIntervalMs.P50, r.TickIntervalMs.P95, r.TickIntervalMs.P99, r.TickIntervalMs.Max)
	for _, e := range r.Errors {
		fmt.Printf("  ! %s\n", e)
	}
}

func cmp(cond bool, a, b string) string {
	if cond {
		return a
	}
	return b
}
