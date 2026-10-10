package session

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

const (
	sendQueueSize = 64
	writeTimeout  = 5 * time.Second
	pingInterval  = 15 * time.Second
	pingTimeout   = 10 * time.Second
)

const (
	// CloseSessionEnded はセッションが終わった(決着・解散・破棄)
	CloseSessionEnded websocket.StatusCode = 4000
	// CloseReplaced は同じプレイヤーが新しい接続を開いた
	CloseReplaced websocket.StatusCode = 4001
	// CloseSlow は送信キューがあふれた。再接続すれば snapshot で復旧する
	CloseSlow websocket.StatusCode = 4002
)

var connSeq atomic.Uint64

// Conn は 1 つの WebSocket 接続の送信側。送信は接続ごとの goroutine(writeLoop)が行い、
// 遅い接続がセッションの処理や他のプレイヤーへの配信を止めないようにする
type Conn struct {
	ID       uint64
	PlayerID string
	ws       *websocket.Conn
	// Binary は位置のメッセージ(transform / transforms)をバイナリでやり取りする接続(enc=bin。binary.go)。
	// latest に入るのはバイナリの transforms になる。それ以外(queue)は JSON のまま
	Binary bool

	queue  chan []byte
	latest chan []byte

	closeOnce sync.Once
	closed    chan struct{}
	code      websocket.StatusCode
	reason    string
	flush     bool
}

// NewConn は ws の送信側を作る。WriteLoop を別の goroutine で回すこと
func NewConn(playerID string, ws *websocket.Conn) *Conn {
	return &Conn{
		ID:       connSeq.Add(1),
		PlayerID: playerID,
		ws:       ws,
		queue:    make(chan []byte, sendQueueSize),
		latest:   make(chan []byte, 1),
		closed:   make(chan struct{}),
	}
}

// Close は接続を切る。何度呼んでもよく、最初の理由が使われる
func (c *Conn) Close(code websocket.StatusCode, reason string) {
	c.close(code, reason, false)
}

// CloseAfterFlush は、送信キューに残ったメッセージ(session.finished など)を送ってから接続を切る
func (c *Conn) CloseAfterFlush(code websocket.StatusCode, reason string) {
	c.close(code, reason, true)
}

func (c *Conn) close(code websocket.StatusCode, reason string, flush bool) {
	c.closeOnce.Do(func() {
		c.code, c.reason, c.flush = code, reason, flush
		close(c.closed)
	})
}

// Done は接続が切られたら閉じる
func (c *Conn) Done() <-chan struct{} {
	return c.closed
}

func (c *Conn) enqueue(b []byte) {
	select {
	case c.queue <- b:
	default:
		c.Close(CloseSlow, "send queue overflow")
	}
}

func (c *Conn) replaceLatest(b []byte) {
	for {
		select {
		case c.latest <- b:
			return
		default:
		}
		select {
		case <-c.latest:
		default:
		}
	}
}

// WriteLoop は送信キューを WebSocket に書き出し、定期的に ping を送る。接続が切られたら close を送って戻る
func (c *Conn) WriteLoop(ctx context.Context) {
	ping := time.NewTicker(pingInterval)
	defer ping.Stop()
	for {
		var b []byte
		typ := websocket.MessageText
		select {
		case <-ctx.Done():
			c.Close(websocket.StatusGoingAway, "server shutting down")
		case <-c.closed:
		case b = <-c.queue:
		case b = <-c.latest:
			if c.Binary {
				typ = websocket.MessageBinary
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := c.ws.Ping(pctx)
			cancel()
			if err != nil {
				c.Close(websocket.StatusGoingAway, "ping timeout")
			}
			continue
		}
		if b == nil {
			if c.flush {
				c.drain(ctx)
			}
			_ = c.ws.Close(c.code, c.reason)
			return
		}
		wctx, cancel := context.WithTimeout(ctx, writeTimeout)
		err := c.ws.Write(wctx, typ, b)
		cancel()
		if err != nil {
			c.Close(websocket.StatusGoingAway, "write failed")
		}
	}
}

func (c *Conn) drain(ctx context.Context) {
	for {
		select {
		case b := <-c.queue:
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.ws.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				return
			}
		default:
			return
		}
	}
}

// SendError は本人にだけ error を送る(不正なメッセージなど。確定状態ではないので、セッションを通さない)
func (c *Conn) SendError(code, message string) {
	if b, ok := encode(errorMessage(code, message)); ok {
		c.enqueue(b)
	}
}
