// Package player はプレイヤーの識別(playerId の発行と、Cookie に入れる署名付きトークン)を扱う。
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

// CookieName はプレイヤーを識別する Cookie の名前
const CookieName = "iubeo_player"

const cookieMaxAge = 30 * 24 * time.Hour

var b64 = base64.RawURLEncoding

// NewID は新しい playerId を作る。他のプレイヤーにも配る値なので、Cookie の値(トークン)とは別物
func NewID() string {
	return rand.Text()
}

// Signer は playerId を HMAC-SHA256 で署名したトークンを作り、検証する
type Signer struct {
	key []byte
}

// NewSigner は key で署名する Signer を作る
func NewSigner(key []byte) *Signer {
	return &Signer{key: key}
}

func (s *Signer) mac(payload string) []byte {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	return m.Sum(nil)
}

// Token は playerId のトークン(`<base64url(playerId)>.<base64url(HMAC)>`)を返す
func (s *Signer) Token(playerID string) string {
	payload := b64.EncodeToString([]byte(playerID))
	return payload + "." + b64.EncodeToString(s.mac(payload))
}

// Verify はトークンの署名を検証し、playerId を返す
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

// FromRequest はリクエストの Cookie から playerId を取り出す。Cookie が無いか署名が合わなければ false
func (s *Signer) FromRequest(r *http.Request) (string, bool) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return "", false
	}
	return s.Verify(c.Value)
}

// SetCookie は playerId のトークンを HttpOnly Cookie に入れる
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
