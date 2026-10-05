package player

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var testKey = []byte("0123456789abcdef0123456789abcdef")

func TestTokenRoundTrip(t *testing.T) {
	s := NewSigner(testKey)
	id := NewID()
	token := s.Token(id)
	if strings.Contains(token, id) {
		t.Errorf("token %q contains the raw playerId", token)
	}
	got, ok := s.Verify(token)
	if !ok || got != id {
		t.Fatalf("Verify = %q, %v; want %q, true", got, ok, id)
	}
}

func TestVerifyRejects(t *testing.T) {
	s := NewSigner(testKey)
	token := s.Token("p1")
	payload, sig, _ := strings.Cut(token, ".")
	other := NewSigner([]byte("ffffffffffffffffffffffffffffffff")).Token("p1")
	forgedPayload, _, _ := strings.Cut(s.Token("p2"), ".")

	tests := map[string]string{
		"空":              "",
		"区切りが無い":         payload,
		"別の鍵で署名":         other,
		"ID を差し替えた":      forgedPayload + "." + sig,
		"署名が base64 でない": payload + ".!!!",
		"ID が空":          "." + sig,
	}
	for name, tok := range tests {
		t.Run(name, func(t *testing.T) {
			if id, ok := s.Verify(tok); ok {
				t.Errorf("Verify(%q) = %q, true; want false", tok, id)
			}
		})
	}
}

func TestCookie(t *testing.T) {
	s := NewSigner(testKey)
	rec := httptest.NewRecorder()
	s.SetCookie(rec, "p1")
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies = %d, want 1", len(cookies))
	}
	c := cookies[0]
	if c.Name != CookieName || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" {
		t.Errorf("cookie attributes = %+v", c)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(c)
	if id, ok := s.FromRequest(req); !ok || id != "p1" {
		t.Errorf("FromRequest = %q, %v; want p1, true", id, ok)
	}
	if _, ok := s.FromRequest(httptest.NewRequest(http.MethodGet, "/", nil)); ok {
		t.Error("FromRequest without cookie = true")
	}
}
