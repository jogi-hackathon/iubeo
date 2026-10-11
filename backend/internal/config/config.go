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

type Config struct {
	Addr                 string
	SigningKey           []byte
	AllowedOrigins       []string
	MatchSize            int
	PhaseCount           int
	PhaseDuration        time.Duration
	IntermissionDuration time.Duration
	BypassDuration       time.Duration
	FireDuration         time.Duration
	CpuFillAfter         time.Duration
	WispKey              []byte
	WispURL              string
	VCSeed               []byte
	VCSignalingURL       string
	VCMediaURL           string
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Addr:                 ":8080",
		MatchSize:            3,
		PhaseCount:           3,
		PhaseDuration:        time.Minute,
		IntermissionDuration: 15 * time.Second,
		BypassDuration:       30 * time.Second,
		FireDuration:         10 * time.Second,
		CpuFillAfter:         30 * time.Second,
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

	return cfg, errors.Join(errs...)
}
