package player

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
)

const CookieName = "iubeo_player"

const cookieMaxAge = 30 * 24 * time.Hour

var b64 = base64.RawURLEncoding

func NewID() string {
	return rand.Text()
}

type Signer struct {
	key []byte
}

func NewSigner(key []byte) *Signer {
	return &Signer{key: key}
}

func (s *Signer) mac(payload string) []byte {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	return m.Sum(nil)
}

func (s *Signer) Token(playerID string) string {
	payload := b64.EncodeToString([]byte(playerID))
	return payload + "." + b64.EncodeToString(s.mac(payload))
}

func (s *Signer) Verify(token string) (string, bool) {
	payload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return "", false
	}
	got, err := b64.DecodeString(sig)
	if err != nil || !hmac.Equal(got, s.mac(payload)) {
		return "", false
	}
	id, err := b64.DecodeString(payload)
	if err != nil || len(id) == 0 {
		return "", false
	}
	return string(id), true
}

func (s *Signer) FromRequest(r *http.Request) (string, bool) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return "", false
	}
	return s.Verify(c.Value)
}

func (s *Signer) SetCookie(w http.ResponseWriter, playerID string) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    s.Token(playerID),
		Path:     "/",
		MaxAge:   int(cookieMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}
