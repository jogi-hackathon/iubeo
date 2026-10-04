package server

import (
	"net/http"
	"testing"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

func newPlayer(t *testing.T, h http.Handler) (*http.Cookie, string) {
	t.Helper()
	res := do(t, h, http.MethodPost, "/api/v1/players")
	return playerCookie(t, res), decode[api.Me](t, res).PlayerId
}

func TestMatchmakingRequiresCookie(t *testing.T) {
	h := newTestServer(t)
	for _, method := range []string{http.MethodPost, http.MethodGet, http.MethodDelete} {
		if res := do(t, h, method, "/api/v1/matchmaking"); res.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", method, res.StatusCode)
		}
	}
}

func TestMatchmakingFlow(t *testing.T) {
	h := newTestServerSize(t, 2)
	c1, _ := newPlayer(t, h)
	c2, _ := newPlayer(t, h)

	if res := do(t, h, http.MethodGet, "/api/v1/matchmaking", c1); res.StatusCode != http.StatusNotFound {
		t.Errorf("GET before join: status = %d, want 404", res.StatusCode)
	}
	if res := do(t, h, http.MethodDelete, "/api/v1/matchmaking", c1); res.StatusCode != http.StatusNotFound {
		t.Errorf("DELETE before join: status = %d, want 404", res.StatusCode)
	}

	res := do(t, h, http.MethodPost, "/api/v1/matchmaking", c1)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("POST: status = %d, want 200", res.StatusCode)
	}
	if st := decode[api.MatchmakingStatus](t, res); st.Status != api.Queued || st.SessionId != nil {
		t.Fatalf("POST = %+v, want queued", st)
	}

	res = do(t, h, http.MethodPost, "/api/v1/matchmaking", c2)
	st2 := decode[api.MatchmakingStatus](t, res)
	if st2.Status != api.Matched || st2.SessionId == nil {
		t.Fatalf("second POST = %+v, want matched", st2)
	}

	res = do(t, h, http.MethodGet, "/api/v1/matchmaking", c1)
	if st := decode[api.MatchmakingStatus](t, res); st.Status != api.Matched || st.SessionId == nil || *st.SessionId != *st2.SessionId {
		t.Errorf("GET after match = %+v, want matched to %s", st, *st2.SessionId)
	}

	// 参加中のセッションは /players/me にも出る
	res = do(t, h, http.MethodGet, "/api/v1/players/me", c1)
	if me := decode[api.Me](t, res); me.SessionId == nil || *me.SessionId != *st2.SessionId {
		t.Errorf("me = %+v, want sessionId %s", me, *st2.SessionId)
	}

	if res := do(t, h, http.MethodPost, "/api/v1/matchmaking", c1); res.StatusCode != http.StatusConflict {
		t.Errorf("POST in session: status = %d, want 409", res.StatusCode)
	}
	if res := do(t, h, http.MethodDelete, "/api/v1/matchmaking", c1); res.StatusCode != http.StatusConflict {
		t.Errorf("DELETE after match: status = %d, want 409", res.StatusCode)
	}
}

func TestLeaveMatchmaking(t *testing.T) {
	h := newTestServer(t)
	c1, _ := newPlayer(t, h)
	do(t, h, http.MethodPost, "/api/v1/matchmaking", c1)
	if res := do(t, h, http.MethodDelete, "/api/v1/matchmaking", c1); res.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE: status = %d, want 204", res.StatusCode)
	}
	if res := do(t, h, http.MethodGet, "/api/v1/matchmaking", c1); res.StatusCode != http.StatusNotFound {
		t.Errorf("GET after leave: status = %d, want 404", res.StatusCode)
	}
}
