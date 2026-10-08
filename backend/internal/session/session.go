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

// inboxSize はセッションの入力チャネルの長さ
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

// Receive はプレイヤーから届いたメッセージをセッションに渡す
func (s *Session) Receive(playerID string, msg api.ClientMessage) error {
	v, err := msg.ValueByDiscriminator()
	if err != nil {
		return err
	}
	switch m := v.(type) {
	case api.TransformMessage:
		return s.send(ClientTransform{PlayerID: playerID, Msg: m})
	case api.InteractMessage:
		return s.send(ClientInteract{PlayerID: playerID, Msg: m})
	}
	return errors.New("unknown message")
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

// runtime は run の goroutine が持つもの
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

// step は入力を規則に渡し、結果を行う。セッションが終わったら true
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
			b, ok := encode(o.Msg)
			if !ok {
				continue
			}
			for _, p := range rt.state.Players {
				if c := rt.conns[p.ConnID]; c != nil && p.ID != o.Except {
					deliverBytes(c, o.Msg, b)
				}
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

// deliverBytes は transforms なら古いものと置き換え、それ以外は送信キューに入れる
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

// CreateMultiplayer は自動マッチングでそろったプレイヤーのセッションを作り、goroutine を立てる
func (m *Manager) CreateMultiplayer(playerIDs []string) *Session {
	s := &Session{
		ID:        "sess-" + rand.Text(),
		PlayerIDs: slices.Clone(playerIDs),
		CreatedAt: m.now(),
		inbox:     make(chan any, inboxSize),
		done:      make(chan struct{}),
	}
	timeouts := Timeouts{Start: m.config.StartTimeout, Abandon: m.config.AbandonTimeout}
	st := NewMultiplayerState(s.ID, s.PlayerIDs, s.CreatedAt, timeouts, m.config.Phases, mrand.Uint64())
	m.store.Add(s)
	go s.run(st, m.config, m.now, func() { m.store.Remove(s.ID) })
	slog.Info("session created", "session", s.ID, "players", s.PlayerIDs)
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
func (m *Manager) Create(playerIDs []string) string {
	return m.CreateMultiplayer(playerIDs).ID
}
