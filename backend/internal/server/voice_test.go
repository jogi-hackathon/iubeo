package server

import (
	"net/http"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/voice"
)

var vcSeed = []byte("0123456789abcdef0123456789abcdef")

func newVoiceTestServer(t *testing.T, withVoice bool) http.Handler {
	t.Helper()
	sessions := session.NewManager(session.NewMemoryStore(), time.Now, session.DefaultConfig)
	srv := New(player.NewSigner(testKey), sessions, matchmaking.New(1, sessions, time.Now, matchmaking.Options{}), []string{testOrigin})
	if withVoice {
		iss, err := voice.NewIssuer(vcSeed, "test", 0, time.Now)
		if err != nil {
			t.Fatal(err)
		}
		srv.WithVoice(iss, "wss://vc.example.test/v1/signaling", "https://media.example.test:4443")
	}
	return srv.Handler()
}

func TestVoiceTokenRequiresCookie(t *testing.T) {
	res := do(t, newVoiceTestServer(t, true), http.MethodGet, "/api/v1/voice/token")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", res.StatusCode)
	}
}

func TestVoiceTokenRequiresSession(t *testing.T) {
	h := newVoiceTestServer(t, true)
	cookie := playerCookie(t, do(t, h, http.MethodPost, "/api/v1/players"))
	res := do(t, h, http.MethodGet, "/api/v1/voice/token", cookie)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", res.StatusCode)
	}
}

func TestVoiceTokenIssuedForSessionMember(t *testing.T) {
	h := newVoiceTestServer(t, true)
	sessionID, players := matchPlayers(t, h, 1)

	res := do(t, h, http.MethodGet, "/api/v1/voice/token", players[0].cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	body := decode[api.VoiceToken](t, res)
	if body.Room != sessionID {
		t.Errorf("room = %q, want %q", body.Room, sessionID)
	}
	if body.SignalingUrl != "wss://vc.example.test/v1/signaling" || body.MediaUrl != "https://media.example.test:4443" {
		t.Errorf("connection = %s / %s", body.SignalingUrl, body.MediaUrl)
	}
	if !body.ExpiresAt.After(time.Now()) {
		t.Errorf("expiresAt = %v, want in the future", body.ExpiresAt)
	}
	iss, _ := voice.NewIssuer(vcSeed, "test", 0, time.Now)
	c, err := iss.Verify(body.Token)
	if err != nil {
		t.Fatalf("issued token does not verify: %v", err)
	}
	if c.Sub != players[0].id || c.Room != sessionID {
		t.Errorf("claims = %+v, want sub=%s room=%s", c, players[0].id, sessionID)
	}
}

func TestVoiceTokenUnavailableWithoutConfig(t *testing.T) {
	h := newVoiceTestServer(t, false)
	sessionID, players := matchPlayers(t, h, 1)
	_ = sessionID
	res := do(t, h, http.MethodGet, "/api/v1/voice/token", players[0].cookie)
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
}
