package search

import (
	"context"
	"slices"
	"sync"
	"time"
)

const (
	cacheTTL        = time.Hour
	cacheMaxEntries = 500
)

// Cached は検索結果を一定時間メモリに残す。エラーの結果は残さない。
type Cached struct {
	next Client
	now  func() time.Time

	mu      sync.Mutex
	entries map[string]cacheEntry
}

type cacheEntry struct {
	results   []Result
	storedAt  time.Time
	expiresAt time.Time
}

func NewCached(next Client, now func() time.Time) *Cached {
	return &Cached{next: next, now: now, entries: map[string]cacheEntry{}}
}

func (c *Cached) Search(ctx context.Context, query string) ([]Result, error) {
	key := normalize(query)

	c.mu.Lock()
	if e, ok := c.entries[key]; ok {
		if c.now().Before(e.expiresAt) {
			c.mu.Unlock()
			return slices.Clone(e.results), nil
		}
		delete(c.entries, key)
	}
	c.mu.Unlock()

	results, err := c.next.Search(ctx, query)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if _, exists := c.entries[key]; !exists && len(c.entries) >= cacheMaxEntries {
		c.evictOldestLocked()
	}
	c.entries[key] = cacheEntry{results: slices.Clone(results), storedAt: now, expiresAt: now.Add(cacheTTL)}
	return results, nil
}

func (c *Cached) evictOldestLocked() {
	var oldest string
	var found bool
	for k, e := range c.entries {
		if !found || e.storedAt.Before(c.entries[oldest].storedAt) {
			oldest, found = k, true
		}
	}
	delete(c.entries, oldest)
}
