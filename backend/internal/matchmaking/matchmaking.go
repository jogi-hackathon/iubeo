package matchmaking

import (
	"crypto/rand"
	"errors"
	"slices"
	"sync"
	"time"
)

const StaleAfter = 10 * time.Second

var (
	ErrInSession = errors.New("player is already in a session")
	ErrNotQueued = errors.New("player is not in matchmaking")
	ErrMatched   = errors.New("matchmaking has already succeeded")
)

type State struct {
	QueuedAt  time.Time
	SessionID string
}

type Sessions interface {
	SessionOf(playerID string) (string, bool)
	Create(humanIDs []string, cpuIDs []string) string
}

type Options struct {
	FillAfter      time.Duration
	NewCPUPlayerID func() string
}

type entry struct {
	playerID string
	queuedAt time.Time
	lastSeen time.Time
}

type Matchmaker struct {
	size           int
	sessions       Sessions
	now            func() time.Time
	fillAfter      time.Duration
	newCPUPlayerID func() string

	mu      sync.Mutex
	queue   []*entry
	matched map[string]State
}

func New(size int, sessions Sessions, now func() time.Time, opts Options) *Matchmaker {
	if opts.NewCPUPlayerID == nil {
		opts.NewCPUPlayerID = func() string { return "cpu-" + rand.Text() }
	}
	return &Matchmaker{
		size:           size,
		sessions:       sessions,
		now:            now,
		fillAfter:      opts.FillAfter,
		newCPUPlayerID: opts.NewCPUPlayerID,
		matched:        map[string]State{},
	}
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
		sessionID := m.sessions.Create(ids, nil)
		for _, e := range group {
			m.matched[e.playerID] = State{QueuedAt: e.queuedAt, SessionID: sessionID}
		}
		m.queue = slices.Delete(m.queue, 0, m.size)
	}
}

func (m *Matchmaker) fillWithCPUs(now time.Time) {
	if m.fillAfter <= 0 || len(m.queue) == 0 || len(m.queue) >= m.size {
		return
	}
	if now.Sub(m.queue[0].queuedAt) < m.fillAfter {
		return
	}
	humanIDs := make([]string, len(m.queue))
	for i, e := range m.queue {
		humanIDs[i] = e.playerID
	}
	cpuIDs := make([]string, 0, m.size-len(humanIDs))
	for range m.size - len(humanIDs) {
		cpuIDs = append(cpuIDs, m.newCPUPlayerID())
	}
	sessionID := m.sessions.Create(humanIDs, cpuIDs)
	for _, e := range m.queue {
		m.matched[e.playerID] = State{QueuedAt: e.queuedAt, SessionID: sessionID}
	}
	m.queue = nil
}

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
	m.fillWithCPUs(now)
	return m.status(playerID)
}

func (m *Matchmaker) Get(playerID string) (State, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()

	m.evictStale(now)
	if i := m.find(playerID); i >= 0 {
		m.queue[i].lastSeen = now
	}
	m.fillWithCPUs(now)
	return m.status(playerID)
}

// Enrolled は「待機中か、マッチング成立後か」を答える。WISP の発行可否の判定に使うので、
// Get と違って待機列を進めない(lastSeen を延命しない・CPU を補充しない)。
// 放置された待機は Get や Join と同じように捨てる。
func (m *Matchmaker) Enrolled(playerID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.evictStale(m.now())
	if _, matched := m.matchedState(playerID); matched {
		return true
	}
	return m.find(playerID) >= 0
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
