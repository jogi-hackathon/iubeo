package voice

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const DefaultTTL = 30 * time.Minute

var b64 = base64.RawURLEncoding

type header struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

type Claims struct {
	Sub  string `json:"sub"`
	Room string `json:"room"`
	Iss  string `json:"iss"`
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
}

type Issuer struct {
	key ed25519.PrivateKey
	kid string
	ttl time.Duration
	now func() time.Time
}

func NewIssuer(seed []byte, kid string, ttl time.Duration, now func() time.Time) (*Issuer, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("ed25519 seed must be %d bytes, got %d", ed25519.SeedSize, len(seed))
	}
	if ttl == 0 {
		ttl = DefaultTTL
	}
	if kid == "" {
		kid = "iubeo"
	}
	return &Issuer{key: ed25519.NewKeyFromSeed(seed), kid: kid, ttl: ttl, now: now}, nil
}

func (i *Issuer) Issue(playerID, room string) (string, time.Time, error) {
	now := i.now()
	expiresAt := now.Add(i.ttl)

	h, err := json.Marshal(header{Alg: "EdDSA", Kid: i.kid})
	if err != nil {
		return "", time.Time{}, err
	}
	p, err := json.Marshal(Claims{Sub: playerID, Room: room, Iss: "iubeo", Iat: now.Unix(), Exp: expiresAt.Unix()})
	if err != nil {
		return "", time.Time{}, err
	}

	signingInput := b64.EncodeToString(h) + "." + b64.EncodeToString(p)
	sig := ed25519.Sign(i.key, []byte(signingInput))
	return signingInput + "." + b64.EncodeToString(sig), expiresAt, nil
}

func (i *Issuer) Verify(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("token must have 3 parts")
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil {
		return Claims{}, err
	}
	if !ed25519.Verify(i.key.Public().(ed25519.PublicKey), []byte(parts[0]+"."+parts[1]), sig) {
		return Claims{}, errors.New("signature does not verify")
	}
	body, err := b64.DecodeString(parts[1])
	if err != nil {
		return Claims{}, err
	}
	var c Claims
	if err := json.Unmarshal(body, &c); err != nil {
		return Claims{}, err
	}
	if c.Sub == "" || c.Room == "" {
		return Claims{}, errors.New("sub and room are required")
	}
	if i.now().Unix() >= c.Exp {
		return Claims{}, errors.New("token expired")
	}
	return c, nil
}
