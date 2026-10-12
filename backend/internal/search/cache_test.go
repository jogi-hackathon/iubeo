package search

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

type countingClient struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (c *countingClient) Search(_ context.Context, query string) ([]Result, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls++
	if c.err != nil {
		return nil, c.err
	}
	return []Result{{Title: query}}, nil
}

func TestCachedReusesNormalizedQueryWithinTTL(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1000, 0)}
	next := &countingClient{}
	c := NewCached(next, clock.now)

	for _, q := range []string{"Go  言語", " go 言語 ", "GO 言語"} {
		if _, err := c.Search(context.Background(), q); err != nil {
			t.Fatal(err)
		}
	}
	if next.calls != 1 {
		t.Fatalf("calls = %d, want 1", next.calls)
	}

	clock.t = clock.t.Add(time.Hour)
	if _, err := c.Search(context.Background(), "go 言語"); err != nil {
		t.Fatal(err)
	}
	if next.calls != 2 {
		t.Fatalf("calls after TTL = %d, want 2", next.calls)
	}
}

func TestCachedDoesNotCacheErrors(t *testing.T) {
	next := &countingClient{err: errors.New("boom")}
	c := NewCached(next, time.Now)
	for range 2 {
		if _, err := c.Search(context.Background(), "q"); err == nil {
			t.Fatal("want error")
		}
	}
	if next.calls != 2 {
		t.Fatalf("calls = %d, want 2", next.calls)
	}
}

func TestCachedEvictsOldest(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1000, 0)}
	next := &countingClient{}
	c := NewCached(next, clock.now)
	for i := range cacheMaxEntries + 1 {
		clock.t = clock.t.Add(time.Second)
		if _, err := c.Search(context.Background(), fmt.Sprint("q", i)); err != nil {
			t.Fatal(err)
		}
	}
	if len(c.entries) != cacheMaxEntries {
		t.Fatalf("entries = %d, want %d", len(c.entries), cacheMaxEntries)
	}
	if _, ok := c.entries["q0"]; ok {
		t.Fatal("oldest entry must be evicted")
	}
	if _, ok := c.entries["q1"]; !ok {
		t.Fatal("newer entry must stay")
	}
}

func TestLimiterFixedWindow(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1000, 0)}
	l := NewLimiter(2, time.Minute, clock.now)
	if !l.Allow("a") {
		t.Fatal("first call must pass")
	}
	if !l.Allow("a") {
		t.Fatal("second call must pass")
	}
	if l.Allow("a") {
		t.Fatal("third call in the window must be refused")
	}
	if !l.Allow("b") {
		t.Fatal("other subjects have their own count")
	}
	clock.t = clock.t.Add(time.Minute)
	if !l.Allow("a") {
		t.Fatal("a new window must allow again")
	}
}
