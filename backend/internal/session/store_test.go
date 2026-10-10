package session

import (
	"testing"
	"time"
)

func TestManagerAndStore(t *testing.T) {
	store := NewMemoryStore()
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	m := NewManager(store, func() time.Time { return now }, DefaultConfig)

	s := m.CreateMultiplayer([]string{"p1", "p2"}, nil)
	if s.ID == "" || !s.CreatedAt.Equal(now) || !s.HasPlayer("p1") || s.HasPlayer("p3") {
		t.Fatalf("session = %+v", s)
	}
	if got, ok := store.Get(s.ID); !ok || got != s {
		t.Errorf("Get = %v, %v", got, ok)
	}
	if got, ok := store.ByPlayer("p2"); !ok || got != s {
		t.Errorf("ByPlayer(p2) = %v, %v", got, ok)
	}
	if _, ok := store.ByPlayer("p3"); ok {
		t.Error("ByPlayer(p3) found a session")
	}

	store.Remove(s.ID)
	if _, ok := store.Get(s.ID); ok {
		t.Error("Get after Remove found the session")
	}
	if _, ok := store.ByPlayer("p1"); ok {
		t.Error("ByPlayer after Remove found the session")
	}
}
