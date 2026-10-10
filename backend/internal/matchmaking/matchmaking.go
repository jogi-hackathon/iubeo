// Package matchmaking は自動マッチングの待機列を扱う。
package matchmaking

import (
	"errors"
	"slices"
	"sync"
	"time"
)

// StaleAfter は、最後の POST / GET からこの時間たったプレイヤーを待機列から外す長さ。
// ブラウザを閉じた人を組むと、そのセッションは開始できずに解散し、他の人も巻き込まれるため。
// クライアントはこれより短い間隔(1〜2 秒)でポーリングする
const StaleAfter = 10 * time.Second

var (
	ErrInSession = errors.New("player is already in a session")
	ErrNotQueued = errors.New("player is not in matchmaking")
	ErrMatched   = errors.New("matchmaking has already succeeded")
)

// State はプレイヤーのマッチング状況
type State struct {
	QueuedAt time.Time
	// SessionID はマッチングが成立していればそのセッション。待機中は空
	SessionID string
}

// Sessions はマッチングが参照・作成するセッション
type Sessions interface {
	SessionOf(playerID string) (string, bool)
	Create(playerIDs []string) string
}

type entry struct {
	playerID string
	queuedAt time.Time
	lastSeen time.Time
}

// Matchmaker は待機列。そろった順(先着)に size 人ずつ組んでセッションを作る
type Matchmaker struct {
	size     int
	sessions Sessions
	now      func() time.Time

	mu      sync.Mutex
	queue   []*entry
	matched map[string]State
}

// New は size 人ずつ組む Matchmaker を作る
func New(size int, sessions Sessions, now func() time.Time) *Matchmaker {
	return &Matchmaker{size: size, sessions: sessions, now: now, matched: map[string]State{}}
}

func (m *Matchmaker) find(playerID string) int {
	return slices.IndexFunc(m.queue, func(e *entry) bool { return e.playerID == playerID })
}

func (m *Matchmaker) matchedState(playerID string) (State, bool) {
	st, ok := m.matched[playerID]
	if !ok {
		return State{}, false
	}
	if id, in := m.sessions.SessionOf(playerID); !in || id != st.SessionID {
		delete(m.matched, playerID)
		return State{}, false
	}
	return st, true
}

func (m *Matchmaker) evictStale(now time.Time) {
	m.queue = slices.DeleteFunc(m.queue, func(e *entry) bool { return now.Sub(e.lastSeen) > StaleAfter })
}

func (m *Matchmaker) match() {
	for len(m.queue) >= m.size {
		group := m.queue[:m.size]
		ids := make([]string, len(group))
		for i, e := range group {
			ids[i] = e.playerID
		}
		sessionID := m.sessions.Create(ids)
		for _, e := range group {
			m.matched[e.playerID] = State{QueuedAt: e.queuedAt, SessionID: sessionID}
		}
		m.queue = slices.Delete(m.queue, 0, m.size)
	}
}

// Join は待機列に入る。既に待機中なら今の状況を返す。セッションに参加中なら ErrInSession
func (m *Matchmaker) Join(playerID string) (State, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()

	if _, in := m.sessions.SessionOf(playerID); in {
		return State{}, ErrInSession
	}
	m.evictStale(now)
	if i := m.find(playerID); i >= 0 {
		m.queue[i].lastSeen = now
	} else {
		m.queue = append(m.queue, &entry{playerID: playerID, queuedAt: now, lastSeen: now})
	}
	m.match()
	return m.status(playerID)
}

// Get は今の状況を返す(ポーリング用)。待機中なら最後に見た時刻を更新する
func (m *Matchmaker) Get(playerID string) (State, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()

	m.evictStale(now)
	if i := m.find(playerID); i >= 0 {
		m.queue[i].lastSeen = now
	}
	return m.status(playerID)
}

func (m *Matchmaker) status(playerID string) (State, error) {
	if st, ok := m.matchedState(playerID); ok {
		return st, nil
	}
	if i := m.find(playerID); i >= 0 {
		return State{QueuedAt: m.queue[i].queuedAt}, nil
	}
	return State{}, ErrNotQueued
}

// Leave は待機をやめる。成立済みなら ErrMatched、待機していなければ ErrNotQueued
func (m *Matchmaker) Leave(playerID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.matchedState(playerID); ok {
		return ErrMatched
	}
	i := m.find(playerID)
	if i < 0 {
		return ErrNotQueued
	}
	m.queue = slices.Delete(m.queue, i, i+1)
	return nil
}
