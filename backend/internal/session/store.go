package session

import "sync"

// Store はセッションの保存先。今はメモリだけだが、後から差し替えられるように切り出す(ADR-0004)
type Store interface {
	Add(s *Session)
	Get(id string) (*Session, bool)
	Remove(id string)
	ByPlayer(playerID string) (*Session, bool)
}

// MemoryStore はメモリに持つ Store
type MemoryStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	players  map[string]string
}

var _ Store = (*MemoryStore)(nil)

// NewMemoryStore は空の MemoryStore を作る
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{sessions: map[string]*Session{}, players: map[string]string{}}
}

func (m *MemoryStore) Add(s *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[s.ID] = s
	for _, p := range s.PlayerIDs {
		m.players[p] = s.ID
	}
}

func (m *MemoryStore) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	return s, ok
}

func (m *MemoryStore) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	if !ok {
		return
	}
	delete(m.sessions, id)
	for _, p := range s.PlayerIDs {
		if m.players[p] == id {
			delete(m.players, p)
		}
	}
}

func (m *MemoryStore) ByPlayer(playerID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	id, ok := m.players[playerID]
	if !ok {
		return nil, false
	}
	return m.sessions[id], true
}
