package matchmaking

import (
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"
)

type fakeSessions struct {
	created   [][]string
	cpuCounts []int
	of        map[string]string
}

func (f *fakeSessions) SessionOf(playerID string) (string, bool) {
	id, ok := f.of[playerID]
	return id, ok
}

func (f *fakeSessions) Create(humanIDs []string, cpuIDs []string) string {
	ids := append(slices.Clone(humanIDs), cpuIDs...)
	f.created = append(f.created, ids)
	f.cpuCounts = append(f.cpuCounts, len(cpuIDs))
	id := fmt.Sprintf("sess-%d", len(f.created))
	for _, p := range ids {
		f.of[p] = id
	}
	return id
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }
func newFixture(size int) (*Matchmaker, *fakeSessions, *clock) {
	return newFixtureWithFill(size, 0)
}

func newFixtureWithFill(size int, fillAfter time.Duration) (*Matchmaker, *fakeSessions, *clock) {
	s := &fakeSessions{of: map[string]string{}}
	c := &clock{t: time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)}
	n := 0
	opts := Options{
		FillAfter: fillAfter,
		NewCPUPlayerID: func() string {
			n++
			return fmt.Sprintf("cpu-%d", n)
		},
	}
	return New(size, s, c.now, opts), s, c
}

func mustJoin(t *testing.T, m *Matchmaker, id string) State {
	t.Helper()
	st, err := m.Join(id)
	if err != nil {
		t.Fatalf("Join(%s): %v", id, err)
	}
	return st
}

func TestMatchesInArrivalOrder(t *testing.T) {
	m, s, c := newFixture(3)
	start := c.t

	for _, id := range []string{"p1", "p2"} {
		if st := mustJoin(t, m, id); st.SessionID != "" || !st.QueuedAt.Equal(c.t) {
			t.Fatalf("Join(%s) = %+v, want queued", id, st)
		}
		c.advance(time.Second)
	}
	if st := mustJoin(t, m, "p1"); st.SessionID != "" || !st.QueuedAt.Equal(start) {
		t.Fatalf("rejoin = %+v", st)
	}
	if len(s.created) != 0 {
		t.Fatalf("created %v before enough players", s.created)
	}

	st := mustJoin(t, m, "p3")
	mustJoin(t, m, "p4")
	if st.SessionID != "sess-1" {
		t.Fatalf("p3 state = %+v, want matched", st)
	}
	if want := [][]string{{"p1", "p2", "p3"}}; !slices.EqualFunc(s.created, want, slices.Equal) {
		t.Fatalf("created = %v, want %v", s.created, want)
	}
	if got, err := m.Get("p1"); err != nil || got.SessionID != "sess-1" || !got.QueuedAt.Equal(start) {
		t.Errorf("Get(p1) = %+v, %v", got, err)
	}
	if got, err := m.Get("p4"); err != nil || got.SessionID != "" {
		t.Errorf("Get(p4) = %+v, %v; want queued", got, err)
	}
}

func TestSizeOne(t *testing.T) {
	m, s, _ := newFixture(1)
	if st := mustJoin(t, m, "p1"); st.SessionID == "" {
		t.Fatalf("Join = %+v, want matched", st)
	}
	if len(s.created) != 1 {
		t.Errorf("created = %v", s.created)
	}
}

func TestInSession(t *testing.T) {
	m, s, _ := newFixture(1)
	mustJoin(t, m, "p1")
	if _, err := m.Join("p1"); !errors.Is(err, ErrInSession) {
		t.Errorf("Join in session: err = %v, want ErrInSession", err)
	}
	if err := m.Leave("p1"); !errors.Is(err, ErrMatched) {
		t.Errorf("Leave matched: err = %v, want ErrMatched", err)
	}

	delete(s.of, "p1")
	if _, err := m.Get("p1"); !errors.Is(err, ErrNotQueued) {
		t.Errorf("Get after session ended: err = %v, want ErrNotQueued", err)
	}
	if st := mustJoin(t, m, "p1"); st.SessionID != "sess-2" {
		t.Errorf("rejoin = %+v, want matched to a new session", st)
	}
}

func TestLeave(t *testing.T) {
	m, s, _ := newFixture(2)
	if err := m.Leave("p1"); !errors.Is(err, ErrNotQueued) {
		t.Errorf("Leave not queued: err = %v", err)
	}
	if _, err := m.Get("p1"); !errors.Is(err, ErrNotQueued) {
		t.Errorf("Get not queued: err = %v", err)
	}
	mustJoin(t, m, "p1")
	if err := m.Leave("p1"); err != nil {
		t.Fatalf("Leave: %v", err)
	}
	mustJoin(t, m, "p2")
	if len(s.created) != 0 {
		t.Errorf("created = %v after the first player left", s.created)
	}
}

func TestEvictsStalePlayers(t *testing.T) {
	m, s, c := newFixture(2)
	mustJoin(t, m, "gone")
	c.advance(StaleAfter + time.Second)

	if st := mustJoin(t, m, "late"); st.SessionID != "" {
		t.Fatalf("Join(late) = %+v, want queued", st)
	}
	if len(s.created) != 0 {
		t.Errorf("created = %v, want the stale player not matched", s.created)
	}
	if _, err := m.Get("gone"); !errors.Is(err, ErrNotQueued) {
		t.Errorf("Get(gone): err = %v, want ErrNotQueued", err)
	}
}

func TestPollingKeepsPlayerQueued(t *testing.T) {
	m, s, c := newFixture(2)
	mustJoin(t, m, "p1")
	for range 5 {
		c.advance(StaleAfter / 2)
		if _, err := m.Get("p1"); err != nil {
			t.Fatalf("Get while polling: %v", err)
		}
	}
	mustJoin(t, m, "p2")
	if want := [][]string{{"p1", "p2"}}; !slices.EqualFunc(s.created, want, slices.Equal) {
		t.Errorf("created = %v, want %v", s.created, want)
	}
}

// poll は、クライアントと同じように 1 秒ごとに Get して待つ(10 秒見ないと外されるため)
func poll(t *testing.T, m *Matchmaker, c *clock, id string, seconds int) State {
	t.Helper()
	var st State
	for range seconds {
		c.advance(time.Second)
		var err error
		if st, err = m.Get(id); err != nil {
			t.Fatalf("Get(%s): %v", id, err)
		}
		if st.SessionID != "" {
			return st
		}
	}
	return st
}

func TestFillsWithCPUsAfterWaiting(t *testing.T) {
	m, s, c := newFixtureWithFill(3, 30*time.Second)
	mustJoin(t, m, "p1")

	if st := poll(t, m, c, "p1", 29); st.SessionID != "" {
		t.Fatalf("matched before FillAfter: %+v", st)
	}
	st := poll(t, m, c, "p1", 2)
	if st.SessionID != "sess-1" {
		t.Fatalf("matched = %+v, want sess-1", st)
	}
	if want := [][]string{{"p1", "cpu-1", "cpu-2"}}; !slices.EqualFunc(s.created, want, slices.Equal) {
		t.Errorf("created = %v, want %v", s.created, want)
	}
	if want := []int{2}; !slices.Equal(s.cpuCounts, want) {
		t.Errorf("cpuCounts = %v, want %v", s.cpuCounts, want)
	}
}

func TestFillsOnlyMissingSlots(t *testing.T) {
	m, s, c := newFixtureWithFill(3, 30*time.Second)
	mustJoin(t, m, "p1")
	// 10 秒見ないと外れるので、1 人目もポーリングしながら待つ
	for range 9 {
		c.advance(time.Second)
		if _, err := m.Get("p1"); err != nil {
			t.Fatalf("Get(p1): %v", err)
		}
	}
	c.advance(time.Second)
	mustJoin(t, m, "p2")

	var st State
	for range 25 {
		c.advance(time.Second)
		// 2 人ともポーリングする
		if _, err := m.Get("p2"); err != nil {
			t.Fatalf("Get(p2): %v", err)
		}
		var err error
		if st, err = m.Get("p1"); err != nil {
			t.Fatalf("Get(p1): %v", err)
		}
		if st.SessionID != "" {
			break
		}
	}
	if st.SessionID != "sess-1" {
		t.Fatalf("p1 = %+v, want sess-1", st)
	}
	if want := [][]string{{"p1", "p2", "cpu-1"}}; !slices.EqualFunc(s.created, want, slices.Equal) {
		t.Errorf("created = %v, want %v", s.created, want)
	}
	if got, err := m.Get("p2"); err != nil || got.SessionID != "sess-1" {
		t.Errorf("p2 = %+v, %v; want the same session", got, err)
	}
}

func TestFillDisabledByDefault(t *testing.T) {
	m, s, c := newFixture(3)
	mustJoin(t, m, "p1")
	if st := poll(t, m, c, "p1", 60); st.SessionID != "" {
		t.Fatalf("matched with FillAfter=0: %+v", st)
	}
	if len(s.created) != 0 {
		t.Errorf("created = %v, want nothing", s.created)
	}
}

func TestFillDoesNotFireWhenEnoughPlayers(t *testing.T) {
	m, s, c := newFixtureWithFill(2, time.Second)
	mustJoin(t, m, "p1")
	c.advance(2 * time.Second)
	mustJoin(t, m, "p2")
	if want := [][]string{{"p1", "p2"}}; !slices.EqualFunc(s.created, want, slices.Equal) {
		t.Errorf("created = %v, want %v", s.created, want)
	}
	if want := []int{0}; !slices.Equal(s.cpuCounts, want) {
		t.Errorf("cpuCounts = %v, want %v", s.cpuCounts, want)
	}
}
