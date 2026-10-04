package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
)

var testKey = []byte("0123456789abcdef0123456789abcdef")

func newTestServer(t *testing.T) http.Handler {
	t.Helper()
	return newTestServerSize(t, 3)
}

func newTestServerSize(t *testing.T, size int) http.Handler {
	t.Helper()
	sessions := session.NewManager(session.NewMemoryStore(), time.Now)
	return New(player.NewSigner(testKey), sessions, matchmaking.New(size, sessions, time.Now)).Handler()
}

func do(t *testing.T, h http.Handler, method, path string, cookies ...*http.Cookie) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func decode[T any](t *testing.T, res *http.Response) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(res.Body).Decode(&v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return v
}

func playerCookie(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, c := range res.Cookies() {
		if c.Name == player.CookieName {
			return c
		}
	}
	t.Fatalf("no %s cookie in response", player.CookieName)
	return nil
}

func TestCreatePlayer(t *testing.T) {
	h := newTestServer(t)

	res := do(t, h, http.MethodPost, "/api/v1/players")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", res.StatusCode)
	}
	cookie := playerCookie(t, res)
	me := decode[api.Me](t, res)
	if me.PlayerId == "" || me.SessionId != nil {
		t.Errorf("me = %+v", me)
	}
	if cookie.Value == me.PlayerId {
		t.Error("cookie value equals playerId")
	}

	// 有効な Cookie があれば、同じプレイヤーを 200 で返し、Cookie は発行し直さない
	res = do(t, h, http.MethodPost, "/api/v1/players", cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if len(res.Cookies()) != 0 {
		t.Errorf("cookies = %v, want none", res.Cookies())
	}
	if again := decode[api.Me](t, res); again.PlayerId != me.PlayerId {
		t.Errorf("playerId = %q, want %q", again.PlayerId, me.PlayerId)
	}

	// 無効な Cookie なら新しく作る
	res = do(t, h, http.MethodPost, "/api/v1/players", &http.Cookie{Name: player.CookieName, Value: me.PlayerId})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", res.StatusCode)
	}
	if other := decode[api.Me](t, res); other.PlayerId == me.PlayerId {
		t.Error("forged cookie returned the same player")
	}
}

func TestGetMe(t *testing.T) {
	h := newTestServer(t)

	if res := do(t, h, http.MethodGet, "/api/v1/players/me"); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("without cookie: status = %d, want 401", res.StatusCode)
	}
	forged := &http.Cookie{Name: player.CookieName, Value: "cDE.AAAA"}
	if res := do(t, h, http.MethodGet, "/api/v1/players/me", forged); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("forged cookie: status = %d, want 401", res.StatusCode)
	}

	created := do(t, h, http.MethodPost, "/api/v1/players")
	want := decode[api.Me](t, created)
	res := do(t, h, http.MethodGet, "/api/v1/players/me", playerCookie(t, created))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if got := decode[api.Me](t, res); got.PlayerId != want.PlayerId || got.SessionId != nil {
		t.Errorf("me = %+v, want %+v", got, want)
	}
}
