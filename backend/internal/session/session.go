// Package session はゲームのセッションを扱う。
//
// セッションごとに goroutine を 1 つ立て、受信・タイマーなどすべての入力を 1 つのチャネルから順番に
// Step(純粋な関数)に渡す。セッションの状態に触るのはこの goroutine だけ(ADR-0004)
package session

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log/slog"
	mrand "math/rand/v2"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// ErrEnded はセッションが既に終わっている
var ErrEnded = errors.New("session has ended")

// Config はセッションの時間の決まり
type Config struct {
	// StartTimeout までに人間全員が WebSocket で接続しなければ解散する
	StartTimeout time.Duration
	// 人間が全員切断してから AbandonTimeout たっても誰も戻らなければ破棄する
	AbandonTimeout time.Duration
	// TickInterval ごとに transforms を配る(20Hz = 50ms)
	TickInterval time.Duration
	// Phases はフェーズの数と長さ、決着までの長さ
	Phases PhaseRules
}

// DefaultConfig は state-schema.md の決まりどおりの値
var DefaultConfig = Config{
	StartTimeout:   30 * time.Second,
	AbandonTimeout: 60 * time.Second,
	TickInterval:   50 * time.Millisecond,
	Phases: PhaseRules{
		Count:        3,
		Duration:     30 * time.Second,
		Intermission: 10 * time.Second,
		Bypass:       30 * time.Second,
		Fire:         10 * time.Second,
	},
}

const inboxSize = 256

// Session は 1 回のゲーム。状態は run の goroutine だけが持つ
type Session struct {
	ID string
	// PlayerIDs は参加者。並びが席(seat)の順
	PlayerIDs []string
	CreatedAt time.Time

	inbox chan any
	done  chan struct{}
}

// HasPlayer はプレイヤーが参加者かどうかを返す
func (s *Session) HasPlayer(playerID string) bool {
	return slices.Contains(s.PlayerIDs, playerID)
}

// Done はセッションが終わったら閉じる
func (s *Session) Done() <-chan struct{} {
	return s.done
}

type connectReq struct {
	conn *Conn
}

type disconnectReq struct {
	conn *Conn
}

type snapshotReq struct {
	reply chan api.SessionSnapshot
}

func (s *Session) send(v any) error {
	select {
	case s.inbox <- v:
		return nil
	case <-s.done:
		return ErrEnded
	}
}

// Attach は接続をセッションにつなぐ。本人には snapshot が送られる
func (s *Session) Attach(c *Conn) error {
	return s.send(connectReq{conn: c})
}

// Detach は切れた接続をセッションから外す
func (s *Session) Detach(c *Conn) {
	_ = s.send(disconnectReq{conn: c})
}

// ReceiveJSON はプレイヤーから届いた JSON をセッションに渡す。
// 種類(type)だけを先に読み、その型に 1 回だけデコードする。api.ClientMessage の union を経由すると、
// 中身を 3 回パースすることになるため(受信は 20Hz × 人数分あるので、ここを軽くする)
func (s *Session) ReceiveJSON(playerID string, data []byte) error {
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &head); err != nil {
		return err
	}
	switch head.Type {
	case string(api.TransformMessageTypeTransform):
		var m api.TransformMessage
		if err := json.Unmarshal(data, &m); err != nil {
			return err
		}
		return s.send(ClientTransform{PlayerID: playerID, Msg: m})
	case string(api.Interact):
		var m api.InteractMessage
		if err := json.Unmarshal(data, &m); err != nil {
			return err
		}
		return s.send(ClientInteract{PlayerID: playerID, Msg: m})
	}
	// api.ClientMessage.ValueByDiscriminator と同じ文言(クライアントに返すエラーの内容を変えないため)
	return errors.New("unknown discriminator value: " + head.Type)
}

// Snapshot は今のスナップショットを返す
func (s *Session) Snapshot(ctx context.Context) (api.SessionSnapshot, error) {
	reply := make(chan api.SessionSnapshot, 1)
	if err := s.send(snapshotReq{reply: reply}); err != nil {
		return api.SessionSnapshot{}, err
	}
	select {
	case snap := <-reply:
		return snap, nil
	case <-s.done:
		return api.SessionSnapshot{}, ErrEnded
	case <-ctx.Done():
		return api.SessionSnapshot{}, ctx.Err()
	}
}

type runtime struct {
	state State
	conns map[uint64]*Conn
	now   func() time.Time
}

func (s *Session) run(st State, cfg Config, now func() time.Time, onEnd func()) {
	defer onEnd()
	defer close(s.done)

	rt := &runtime{state: st, conns: map[uint64]*Conn{}, now: now}
	ticker := time.NewTicker(cfg.TickInterval)
	defer ticker.Stop()

	for {
		var in Input
		select {
		case <-ticker.C:
			in = Tick{Now: now()}
		case v := <-s.inbox:
			switch v := v.(type) {
			case connectReq:
				rt.conns[v.conn.ID] = v.conn
				in = Connect{PlayerID: v.conn.PlayerID, ConnID: v.conn.ID, Now: now()}
			case disconnectReq:
				delete(rt.conns, v.conn.ID)
				in = Disconnect{PlayerID: v.conn.PlayerID, ConnID: v.conn.ID, Now: now()}
			case snapshotReq:
				v.reply <- rt.state.Snapshot(now())
				continue
			case ClientInteract:
				v.Now = now()
				v.NewID = uuid.NewString()
				in = v
			case Input:
				in = v
			}
		}
		if rt.step(in) {
			return
		}
	}
}

func (rt *runtime) step(in Input) bool {
	var out []Output
	rt.state, out = Step(rt.state, in)
	for _, o := range out {
		switch o := o.(type) {
		case Send:
			if p := rt.state.player(o.To); p != nil {
				rt.deliver(rt.conns[p.ConnID], o.Msg)
			}
		case Broadcast:
			// transforms はバイナリの接続(enc=bin)にはバイナリで送る。要る形式だけを作る
			var b, bin []byte
			tm, isTransforms := o.Msg.(api.TransformsMessage)
			for _, p := range rt.state.Players {
				c := rt.conns[p.ConnID]
				if c == nil || p.ID == o.Except {
					continue
				}
				if isTransforms && c.Binary {
					if bin == nil {
						bin = encodeTransformsBinary(tm, &rt.state)
					}
					c.replaceLatest(bin)
					continue
				}
				if b == nil {
					var ok bool
					if b, ok = encode(o.Msg); !ok {
						break
					}
				}
				deliverBytes(c, o.Msg, b)
			}
		case CloseConn:
			if c := rt.conns[o.ConnID]; c != nil {
				c.Close(CloseReplaced, string(o.Reason))
				delete(rt.conns, o.ConnID)
			}
		case End:
			for _, c := range rt.conns {
				c.CloseAfterFlush(CloseSessionEnded, string(o.Reason))
			}
			slog.Info("session ended", "session", rt.state.ID, "reason", o.Reason)
			return true
		}
	}
	return false
}

func encode(msg any) ([]byte, bool) {
	b, err := json.Marshal(msg)
	if err != nil {
		slog.Error("encode message", "err", err)
		return nil, false
	}
	return b, true
}

func (rt *runtime) deliver(c *Conn, msg any) {
	if c == nil {
		return
	}
	if b, ok := encode(msg); ok {
		deliverBytes(c, msg, b)
	}
}

func deliverBytes(c *Conn, msg any, b []byte) {
	if _, ok := msg.(api.TransformsMessage); ok {
		c.replaceLatest(b)
		return
	}
	c.enqueue(b)
}

// Manager はセッションを作り、Store に置く。終わったセッションは Store から除く
type Manager struct {
	store  Store
	now    func() time.Time
	config Config
}

// NewManager は store にセッションを置く Manager を作る
func NewManager(store Store, now func() time.Time, config Config) *Manager {
	return &Manager{store: store, now: now, config: config}
}

// Store はセッションの保存先を返す
func (m *Manager) Store() Store {
	return m.store
}

// CreateMultiplayer は自動マッチングでそろったプレイヤーのセッションを作り、goroutine を立てる。
// cpuIDs はデバッグ用に足す CPU(接続しない)。席は人間、CPU の順
func (m *Manager) CreateMultiplayer(humanIDs []string, cpuIDs []string) *Session {
	playerIDs := append(slices.Clone(humanIDs), cpuIDs...)
	s := &Session{
		ID:        "sess-" + rand.Text(),
		PlayerIDs: playerIDs,
		CreatedAt: m.now(),
		inbox:     make(chan any, inboxSize),
		done:      make(chan struct{}),
	}
	timeouts := Timeouts{Start: m.config.StartTimeout, Abandon: m.config.AbandonTimeout}
	st := NewMultiplayerState(s.ID, humanIDs, cpuIDs, s.CreatedAt, timeouts, m.config.Phases, mrand.Uint64())
	m.store.Add(s)
	go s.run(st, m.config, m.now, func() { m.store.Remove(s.ID) })
	slog.Info("session created", "session", s.ID, "players", s.PlayerIDs, "cpus", len(cpuIDs))
	return s
}

// SessionOf はプレイヤーが参加中のセッションの ID を返す
func (m *Manager) SessionOf(playerID string) (string, bool) {
	s, ok := m.store.ByPlayer(playerID)
	if !ok {
		return "", false
	}
	return s.ID, true
}

// Create は自動マッチングでそろったプレイヤーのセッションを作り、その ID を返す(matchmaking.Sessions)
func (m *Manager) Create(humanIDs []string, cpuIDs []string) string {
	return m.CreateMultiplayer(humanIDs, cpuIDs).ID
}
