package search

import (
	"context"
	"strings"
	"sync"
	"time"
)

type Result struct {
	Title       string
	URL         string
	Description string
}

type Client interface {
	Search(ctx context.Context, query string) ([]Result, error)
}

func normalize(query string) string {
	return strings.ToLower(strings.Join(strings.Fields(query), " "))
}

type Limiter struct {
	limit  int
	window time.Duration
	now    func() time.Time

	mu        sync.Mutex
	counts    map[string]windowCount
	lastSweep time.Time
}

type windowCount struct {
	start time.Time
	n     int
}

func NewLimiter(limit int, window time.Duration, now func() time.Time) *Limiter {
	return &Limiter{limit: limit, window: window, now: now, counts: map[string]windowCount{}, lastSweep: now()}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.lastSweep) >= l.window {
		for k, c := range l.counts {
			if now.Sub(c.start) >= l.window {
				delete(l.counts, k)
			}
		}
		l.lastSweep = now
	}
	c := l.counts[key]
	if c.start.IsZero() || now.Sub(c.start) >= l.window {
		c = windowCount{start: now}
	}
	if c.n >= l.limit {
		l.counts[key] = c
		return false
	}
	c.n++
	l.counts[key] = c
	return true
}
