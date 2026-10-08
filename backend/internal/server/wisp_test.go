package server

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

var wispKey = []byte("ffffffffffffffffffffffffffffffff")

func newWispTestServer(t *testing.T, withWisp bool) http.Handler {
	t.Helper()
	sessions := session.NewManager(session.NewMemoryStore(), time.Now, session.DefaultConfig)
	srv := New(player.NewSigner(testKey), sessions, matchmaking.New(3, sessions, time.Now), []string{testOrigin})
	if withWisp {
		srv.WithWisp(wisp.NewIssuer(wispKey, 0, time.Now), "wss://example.test/wisp/")
	}
	return srv.Handler()
}

func TestWispTokenRequiresCookie(t *testing.T) {
	res := do(t, newWispTestServer(t, true), http.MethodGet, "/api/v1/wisp/token")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}
}

func TestWispTokenIssuedForPlayer(t *testing.T) {
	h := newWispTestServer(t, true)
	cookie := playerCookie(t, do(t, h, http.MethodPost, "/api/v1/players"))

	res := do(t, h, http.MethodGet, "/api/v1/wisp/token", cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	body := decode[api.WispToken](t, res)

	u, err := url.Parse(body.Url)
	if err != nil {
		t.Fatal(err)
	}
	if u.Scheme != "wss" || u.Host != "example.test" || u.Path != "/wisp/" {
		t.Fatalf("url = %s, want wss://example.test/wisp/?token=...", body.Url)
	}
	token := u.Query().Get("token")
	if token == "" || strings.Contains(body.Url, " ") {
		t.Fatalf("token missing in %s", body.Url)
	}
	// 発行したトークンは、同じ鍵の検証で、このプレイヤーとして通る
	id, ok := wisp.NewIssuer(wispKey, 0, time.Now).Verify(token)
	if !ok {
		t.Fatal("issued token does not verify")
	}
	me := decode[api.Me](t, do(t, h, http.MethodGet, "/api/v1/players/me", cookie))
	if id != me.PlayerId {
		t.Fatalf("token sub = %q, want %q", id, me.PlayerId)
	}
	if !body.ExpiresAt.After(time.Now()) {
		t.Fatalf("expiresAt = %v, want in the future", body.ExpiresAt)
	}
}

func TestWispTokenUnavailableWithoutConfig(t *testing.T) {
	h := newWispTestServer(t, false)
	cookie := playerCookie(t, do(t, h, http.MethodPost, "/api/v1/players"))
	res := do(t, h, http.MethodGet, "/api/v1/wisp/token", cookie)
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
}
