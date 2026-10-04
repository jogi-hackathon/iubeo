// Package config は環境変数からサーバーの設定を読む。
package config

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// 署名鍵の最小の長さ(バイト)。HMAC-SHA256 の出力と同じ 32 バイト以上にする
const minSigningKeyLen = 32

// Config はサーバーの設定
type Config struct {
	// Addr は待ち受けるアドレス(IUBEO_ADDR。既定 ":8080")
	Addr string
	// SigningKey は Cookie(iubeo_player)のトークンを署名する HMAC の鍵(IUBEO_SIGNING_KEY。必須)
	SigningKey []byte
	// AllowedOrigins は WebSocket の接続を許すオリジン(IUBEO_ALLOWED_ORIGINS。カンマ区切り。必須)
	AllowedOrigins []string
	// MatchSize は自動マッチングで 1 セッションに組む人数(IUBEO_MATCH_SIZE。既定 3。1〜3)
	MatchSize int
}

// Load は getenv(通常は os.Getenv)から設定を読む。足りない・不正な値があればまとめてエラーにする
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{Addr: ":8080", MatchSize: 3}
	var errs []error

	if v := getenv("IUBEO_ADDR"); v != "" {
		cfg.Addr = v
	}

	key := getenv("IUBEO_SIGNING_KEY")
	switch {
	case key == "":
		errs = append(errs, errors.New("IUBEO_SIGNING_KEY is required"))
	case len(key) < minSigningKeyLen:
		errs = append(errs, fmt.Errorf("IUBEO_SIGNING_KEY must be at least %d bytes", minSigningKeyLen))
	default:
		cfg.SigningKey = []byte(key)
	}

	for o := range strings.SplitSeq(getenv("IUBEO_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}
	if len(cfg.AllowedOrigins) == 0 {
		errs = append(errs, errors.New("IUBEO_ALLOWED_ORIGINS is required"))
	}

	if v := getenv("IUBEO_MATCH_SIZE"); v != "" {
		n, err := strconv.Atoi(v)
		// 区画(seat)は 1〜3 まで
		if err != nil || n < 1 || n > 3 {
			errs = append(errs, fmt.Errorf("IUBEO_MATCH_SIZE must be an integer from 1 to 3: %q", v))
		} else {
			cfg.MatchSize = n
		}
	}

	return cfg, errors.Join(errs...)
}
