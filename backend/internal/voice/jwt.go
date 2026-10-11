// Package voice は、ゲームのセッションに紐づいた Voice Chat の接続情報を扱う。
//
// VC サービス(vc-elixir)と moq-relay は Ed25519(EdDSA)の JWT を検証する
// (vc `docs/protocol.md` §1)。ゲームのバックエンドが同じ鍵でトークンを発行し、
// セッションの参加者にだけ渡すことで、room の外からは入れないようにする。
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

// DefaultTTL はトークンの有効期間。接続を始めるまでの猶予と、接続後に再接続する間
const DefaultTTL = 30 * time.Minute

var b64 = base64.RawURLEncoding

// header は JWT のヘッダー。alg は vc 側が EdDSA を要求する(kid は見ていない)
type header struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

// Claims は vc が読む claim。room が部屋、sub がプレイヤー
type Claims struct {
	Sub  string `json:"sub"`
	Room string `json:"room"`
	Iss  string `json:"iss"`
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
}

// Issuer はトークンを発行する。鍵は vc の秘密鍵(JWK の d。32 バイトの種)と共有する
type Issuer struct {
	key ed25519.PrivateKey
	kid string
	ttl time.Duration
	now func() time.Time
}

// NewIssuer は seed(Ed25519 の 32 バイト種)で署名する Issuer を作る。ttl が 0 なら DefaultTTL
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

// Issue はプレイヤーのトークンと、その期限を返す
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

// Verify はトークンを検証して claim を返す。テスト用(本番の検証は vc 側が行う)
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
