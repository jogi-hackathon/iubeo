package wisp

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

const DefaultTTL = 5 * time.Minute

var b64 = base64.RawURLEncoding

type claims struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

type Issuer struct {
	key []byte
	ttl time.Duration
	now func() time.Time
}

func NewIssuer(key []byte, ttl time.Duration, now func() time.Time) *Issuer {
	if ttl == 0 {
		ttl = DefaultTTL
	}
	return &Issuer{key: key, ttl: ttl, now: now}
}

func (i *Issuer) mac(payload string) []byte {
	m := hmac.New(sha256.New, i.key)
	m.Write([]byte(payload))
	return m.Sum(nil)
}

func (i *Issuer) Issue(playerID string) (string, time.Time, error) {
	expiresAt := i.now().Add(i.ttl)
	body, err := json.Marshal(claims{Sub: playerID, Exp: expiresAt.Unix()})
	if err != nil {
		return "", time.Time{}, err
	}
	payload := b64.EncodeToString(body)
	return payload + "." + b64.EncodeToString(i.mac(payload)), expiresAt, nil
}

func (i *Issuer) Verify(token string) (string, bool) {
	payload, sig, ok := strings.Cut(token, ".")
	if !ok {
		return "", false
	}
	got, err := b64.DecodeString(sig)
	if err != nil || !hmac.Equal(got, i.mac(payload)) {
		return "", false
	}
	body, err := b64.DecodeString(payload)
	if err != nil {
		return "", false
	}
	var c claims
	if err := json.Unmarshal(body, &c); err != nil || c.Sub == "" {
		return "", false
	}
	if i.now().Unix() >= c.Exp {
		return "", false
	}
	return c.Sub, true
}
