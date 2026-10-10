// Package config は環境変数からサーバーの設定を読む。
package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

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
	// PhaseCount はフェーズの数(IUBEO_PHASE_COUNT。既定 3。1 以上)
	PhaseCount int
	// PhaseDuration はフェーズの長さ(IUBEO_PHASE_DURATION。既定 1m。time.ParseDuration の形で、正の値)
	PhaseDuration time.Duration
	// IntermissionDuration はフェーズの間の長さ(IUBEO_INTERMISSION_DURATION。既定 15s。time.ParseDuration の形で、正の値)
	IntermissionDuration time.Duration
	// BypassDuration は、最後のフェーズを生き残ってから、火がつかなくても victory にするまでの長さ
	// (IUBEO_BYPASS_DURATION。既定 30s。time.ParseDuration の形で、正の値)
	BypassDuration time.Duration
	// FireDuration は、火をつけてから victory にするまでの長さ(IUBEO_FIRE_DURATION。既定 10s。time.ParseDuration の形で、正の値)
	FireDuration time.Duration
	// CpuFillAfter は、自動マッチングでこの時間たっても人数がそろわないとき、足りない分を CPU で埋める
	// (IUBEO_CPU_FILL_AFTER。既定 0 = 無効。人数がそろう通常の経路には影響しない)。
	// デバッグ用: 動作確認のたびに 3 人分のブラウザと Cookie をそろえるのが大変なので、1 人でも通しを試せるようにする。
	// 既定を無効にしてあるので、使う環境(手元など)だけ明示的に有効にする
	CpuFillAfter time.Duration
	// WispKey は WISP 接続用のトークンを署名する鍵(IUBEO_WISP_KEY。任意。無ければ WISP のトークンは発行しない)
	WispKey []byte
	// WispURL は WISP の WebSocket の基点(IUBEO_WISP_URL。例: wss://example.test/wisp/)。WispKey と組で使う
	WispURL string
	// WispPass は WISP のトークンを発行する合言葉(IUBEO_WISP_PASS。任意)。あれば、これを知っている人にだけ発行する
	WispPass string
	// VCSeed は Voice Chat の JWT を署名する Ed25519 の種(IUBEO_VC_PRIVATE_KEY。base64url の 32 バイト。任意)。
	// 無ければ VC のトークンは発行しない
	VCSeed []byte
	// VCSignalingURL は VC のシグナリング(WebSocket)の URL(IUBEO_VC_SIGNALING_URL。例: wss://vc.example.test/v1/signaling)
	VCSignalingURL string
	// VCMediaURL は MoQ(WebTransport)の URL(IUBEO_VC_MEDIA_URL。例: https://media.example.test:4443)
	VCMediaURL string
}

// Load は getenv(通常は os.Getenv)から設定を読む。足りない・不正な値があればまとめてエラーにする
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Addr:                 ":8080",
		MatchSize:            3,
		PhaseCount:           3,
		PhaseDuration:        time.Minute,
		IntermissionDuration: 15 * time.Second,
		BypassDuration:       30 * time.Second,
		FireDuration:         10 * time.Second,
		// CPU 埋めは既定で無効。使う環境(デバッグ)だけ IUBEO_CPU_FILL_AFTER を明示する
		CpuFillAfter: 0,
	}
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
		if err != nil || n < 1 || n > 3 {
			errs = append(errs, fmt.Errorf("IUBEO_MATCH_SIZE must be an integer from 1 to 3: %q", v))
		} else {
			cfg.MatchSize = n
		}
	}

	if v := getenv("IUBEO_PHASE_COUNT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			errs = append(errs, fmt.Errorf("IUBEO_PHASE_COUNT must be a positive integer: %q", v))
		} else {
			cfg.PhaseCount = n
		}
	}

	for _, d := range []struct {
		name string
		dst  *time.Duration
	}{
		{"IUBEO_PHASE_DURATION", &cfg.PhaseDuration},
		{"IUBEO_INTERMISSION_DURATION", &cfg.IntermissionDuration},
		{"IUBEO_BYPASS_DURATION", &cfg.BypassDuration},
		{"IUBEO_FIRE_DURATION", &cfg.FireDuration},
	} {
		v := getenv(d.name)
		if v == "" {
			continue
		}
		if dur, err := time.ParseDuration(v); err != nil || dur <= 0 {
			errs = append(errs, fmt.Errorf("%s must be a positive duration such as 30s: %q", d.name, v))
		} else {
			*d.dst = dur
		}
	}

	// CPU 埋めは 0 で無効にできるので、正の値の一覧とは別に読む
	if v := getenv("IUBEO_CPU_FILL_AFTER"); v != "" {
		if dur, err := time.ParseDuration(v); err != nil || dur < 0 {
			errs = append(errs, fmt.Errorf("IUBEO_CPU_FILL_AFTER must be a duration such as 30s (0 disables it): %q", v))
		} else {
			cfg.CpuFillAfter = dur
		}
	}

	if v := getenv("IUBEO_WISP_KEY"); v != "" {
		switch {
		case len(v) < minSigningKeyLen:
			errs = append(errs, fmt.Errorf("IUBEO_WISP_KEY must be at least %d bytes", minSigningKeyLen))
		case getenv("IUBEO_WISP_URL") == "":
			errs = append(errs, errors.New("IUBEO_WISP_URL is required when IUBEO_WISP_KEY is set"))
		default:
			cfg.WispKey = []byte(v)
			cfg.WispURL = getenv("IUBEO_WISP_URL")
			cfg.WispPass = getenv("IUBEO_WISP_PASS")
		}
	}

	if v := getenv("IUBEO_VC_PRIVATE_KEY"); v != "" {
		// JWK の d は base64url(パディング無し)。パディング付きで貼られても読めるように落とす
		seed, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(strings.TrimSpace(v), "="))
		switch {
		case err != nil:
			errs = append(errs, fmt.Errorf("IUBEO_VC_PRIVATE_KEY must be base64url: %w", err))
		case len(seed) != ed25519.SeedSize:
			errs = append(errs, fmt.Errorf("IUBEO_VC_PRIVATE_KEY must decode to %d bytes, got %d", ed25519.SeedSize, len(seed)))
		case getenv("IUBEO_VC_SIGNALING_URL") == "" || getenv("IUBEO_VC_MEDIA_URL") == "":
			errs = append(errs, errors.New("IUBEO_VC_SIGNALING_URL and IUBEO_VC_MEDIA_URL are required when IUBEO_VC_PRIVATE_KEY is set"))
		default:
			cfg.VCSeed = seed
			cfg.VCSignalingURL = getenv("IUBEO_VC_SIGNALING_URL")
			cfg.VCMediaURL = getenv("IUBEO_VC_MEDIA_URL")
		}
	}

	return cfg, errors.Join(errs...)
}
