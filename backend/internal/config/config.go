package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/session"
)

const minSigningKeyLen = 32

type Config struct {
	Addr                 string
	SigningKey           []byte
	AllowedOrigins       []string
	AllowedOriginRegexps []*regexp.Regexp
	MatchSize            int
	PhaseCount           int
	PhaseDuration        time.Duration
	IntermissionDuration time.Duration
	BypassDuration       time.Duration
	FireDuration         time.Duration
	CPUFillAfter         time.Duration
	DemoTasks            [][]session.DemoTask
	WispKey              []byte
	WispURL              string
	VCSeed               []byte
	VCSignalingURL       string
	VCMediaURL           string
	BraveAPIKey          string
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Addr:                 ":8080",
		MatchSize:            3,
		PhaseCount:           5,
		PhaseDuration:        45 * time.Second,
		IntermissionDuration: 8 * time.Second,
		BypassDuration:       30 * time.Second,
		FireDuration:         10 * time.Second,
		CPUFillAfter:         30 * time.Second,
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

	// 完全一致の IUBEO_ALLOWED_ORIGINS に加えて、正規表現で許可する Origin(展示用の PR プレビュー等)。
	// カンマ区切り。各パターンは全体一致として扱う。カンマを含むパターンは書けない
	for o := range strings.SplitSeq(getenv("IUBEO_ALLOWED_ORIGIN_PATTERNS"), ",") {
		if o = strings.TrimSpace(o); o == "" {
			continue
		}
		re, err := regexp.Compile("^(?:" + o + ")$")
		if err != nil {
			errs = append(errs, fmt.Errorf("IUBEO_ALLOWED_ORIGIN_PATTERNS has an invalid pattern %q: %w", o, err))
			continue
		}
		cfg.AllowedOriginRegexps = append(cfg.AllowedOriginRegexps, re)
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

	if v := getenv("IUBEO_CPU_FILL_AFTER"); v != "" {
		if dur, err := time.ParseDuration(v); err != nil || dur < 0 {
			errs = append(errs, fmt.Errorf("IUBEO_CPU_FILL_AFTER must be a duration such as 30s (0 disables it): %q", v))
		} else {
			cfg.CPUFillAfter = dur
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
		}
	}

	if v := getenv("IUBEO_VC_PRIVATE_KEY"); v != "" {
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

	cfg.BraveAPIKey = getenv("IUBEO_BRAVE_API_KEY")

	if demo, err := session.ParseDemoTasks(getenv("IUBEO_DEMO_TASKS")); err != nil {
		errs = append(errs, fmt.Errorf("IUBEO_DEMO_TASKS: %w", err))
	} else {
		cfg.DemoTasks = demo
	}

	return cfg, errors.Join(errs...)
}
