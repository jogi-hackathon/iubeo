package tutorial

import (
	"testing"
	"time"
)

func TestPresenceTouchAndActive(t *testing.T) {
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	p := NewPresence(clock, time.Minute)

	if p.Active("p1") {
		t.Fatal("active before touch")
	}
	p.Touch("p1")
	if !p.Active("p1") {
		t.Fatal("want active after touch")
	}

	now = now.Add(30 * time.Second)
	if !p.Active("p1") {
		t.Fatal("want still active within stale window")
	}

	now = now.Add(31 * time.Second)
	if p.Active("p1") {
		t.Fatal("want inactive after stale window")
	}
}

func TestPresenceDropsDepartedPlayers(t *testing.T) {
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	p := NewPresence(func() time.Time { return now }, time.Minute)

	p.Touch("gone")
	now = now.Add(2 * time.Minute)
	p.Touch("here")

	if _, ok := p.lastSeen["gone"]; ok {
		t.Fatal("want the stale entry dropped on touch")
	}
	if _, ok := p.lastSeen["here"]; !ok {
		t.Fatal("want the fresh entry kept")
	}
}
