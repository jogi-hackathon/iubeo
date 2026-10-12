// Package search は検索プロバイダーの結果を取り、キャッシュと利用回数の制限をかける。
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

// normalize は検索語を比べるための形にそろえる(前後の空白を除き、連続する空白を 1 つにし、小文字にする)。
func normalize(query string) string {
	return strings.ToLower(strings.Join(strings.Fields(query), " "))
}

// Limiter は主体(プレイヤー)ごとに、一定期間内の回数を数える固定窓の制限。
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

// Allow は key の今の窓で、まだ上限に達していなければ true を返して数える。
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
