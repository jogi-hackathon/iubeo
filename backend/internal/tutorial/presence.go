package tutorial

import (
	"sync"
	"time"
)

// StaleAfter is how long after the last heartbeat a player is no longer treated as in tutorial.
const StaleAfter = 2 * time.Minute

// Presence records client-reported tutorial activity (tutorial state lives in the browser).
type Presence struct {
	now        func() time.Time
	staleAfter time.Duration

	mu       sync.Mutex
	lastSeen map[string]time.Time
}

func NewPresence(now func() time.Time, staleAfter time.Duration) *Presence {
	if staleAfter <= 0 {
		staleAfter = StaleAfter
	}
	return &Presence{
		now:        now,
		staleAfter: staleAfter,
		lastSeen:   map[string]time.Time{},
	}
}

func (p *Presence) Touch(playerID string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastSeen[playerID] = p.now()
}

func (p *Presence) Active(playerID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	seen, ok := p.lastSeen[playerID]
	if !ok {
		return false
	}
	if p.now().Sub(seen) > p.staleAfter {
		delete(p.lastSeen, playerID)
		return false
	}
	return true
}
