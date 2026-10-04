// Package session はゲームのセッションを扱う。
package session

import (
	"crypto/rand"
	"slices"
	"time"
)

// Session は 1 回のゲーム
type Session struct {
	ID string
	// PlayerIDs は参加者。並びが席(seat)の順
	PlayerIDs []string
	CreatedAt time.Time
}

// HasPlayer はプレイヤーが参加者かどうかを返す
func (s *Session) HasPlayer(playerID string) bool {
	return slices.Contains(s.PlayerIDs, playerID)
}

// Manager はセッションを作り、Store に置く
type Manager struct {
	store Store
	now   func() time.Time
}

// NewManager は store にセッションを置く Manager を作る
func NewManager(store Store, now func() time.Time) *Manager {
	return &Manager{store: store, now: now}
}

// Store はセッションの保存先を返す
func (m *Manager) Store() Store {
	return m.store
}

// CreateMultiplayer は自動マッチングでそろったプレイヤーのセッションを作る
func (m *Manager) CreateMultiplayer(playerIDs []string) *Session {
	s := &Session{
		ID:        "sess-" + rand.Text(),
		PlayerIDs: slices.Clone(playerIDs),
		CreatedAt: m.now(),
	}
	m.store.Add(s)
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
