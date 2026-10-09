// Package wisp は、実サイトへ出る WISP プロキシ(Cloudflare の Worker + Container)へ繋ぐための
// 短い期限つきトークンを発行する。WISP 側は同じ鍵で検証する(frontend/worker/wispToken.ts と形式を揃えている)。
package wisp

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

// DefaultTTL はトークンの有効期間。接続を始めるまでの猶予として数分あれば足りる
const DefaultTTL = 5 * time.Minute

var b64 = base64.RawURLEncoding

// claims はトークンの中身。sub はプレイヤー ID(ログ用)、exp は Unix 秒
type claims struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

// Issuer はトークンを発行・検証する。鍵は WISP 側と共有する
type Issuer struct {
	key []byte
	ttl time.Duration
	now func() time.Time
}

// NewIssuer は key で署名する Issuer を作る。ttl が 0 なら DefaultTTL
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

// Issue は playerID のトークンと、その期限を返す。トークンは `<base64url(JSON)>.<base64url(HMAC)>`
func (i *Issuer) Issue(playerID string) (string, time.Time, error) {
	expiresAt := i.now().Add(i.ttl)
	body, err := json.Marshal(claims{Sub: playerID, Exp: expiresAt.Unix()})
	if err != nil {
		return "", time.Time{}, err
	}
	payload := b64.EncodeToString(body)
	return payload + "." + b64.EncodeToString(i.mac(payload)), expiresAt, nil
}

// Verify はトークンの署名と期限を検証し、プレイヤー ID を返す
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
