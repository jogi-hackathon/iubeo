package config

import (
	"slices"
	"strings"
	"testing"
	"time"
)

const validKey = "0123456789abcdef0123456789abcdef"

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"IUBEO_SIGNING_KEY":     validKey,
		"IUBEO_ALLOWED_ORIGINS": "http://localhost:5173",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Addr != ":8080" {
		t.Errorf("Addr = %q, want :8080", cfg.Addr)
	}
	if cfg.MatchSize != 3 {
		t.Errorf("MatchSize = %d, want 3", cfg.MatchSize)
	}
	if cfg.PhaseCount != 3 || cfg.PhaseDuration != time.Minute || cfg.IntermissionDuration != 15*time.Second {
		t.Errorf("phases = %d, %s, %s, want 3, 30s, 10s", cfg.PhaseCount, cfg.PhaseDuration, cfg.IntermissionDuration)
	}
	if cfg.BypassDuration != 30*time.Second || cfg.FireDuration != 10*time.Second {
		t.Errorf("bypass = %s, fire = %s, want 30s, 10s", cfg.BypassDuration, cfg.FireDuration)
	}
	if cfg.CpuFillAfter != 30*time.Second {
		t.Errorf("CpuFillAfter = %s, want 30s(待機が長いときは CPU とマッチする)", cfg.CpuFillAfter)
	}
	if string(cfg.SigningKey) != validKey {
		t.Errorf("SigningKey = %q", cfg.SigningKey)
	}
}

func TestLoadAll(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"IUBEO_ADDR":                  "127.0.0.1:9000",
		"IUBEO_SIGNING_KEY":           validKey,
		"IUBEO_ALLOWED_ORIGINS":       " http://localhost:5173 , https://iubeo.example ,",
		"IUBEO_MATCH_SIZE":            "1",
		"IUBEO_PHASE_COUNT":           "5",
		"IUBEO_PHASE_DURATION":        "1m30s",
		"IUBEO_INTERMISSION_DURATION": "500ms",
		"IUBEO_BYPASS_DURATION":       "45s",
		"IUBEO_FIRE_DURATION":         "3s",
		"IUBEO_CPU_FILL_AFTER":        "5s",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Addr != "127.0.0.1:9000" {
		t.Errorf("Addr = %q", cfg.Addr)
	}
	if want := []string{"http://localhost:5173", "https://iubeo.example"}; !slices.Equal(cfg.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %q, want %q", cfg.AllowedOrigins, want)
	}
	if cfg.MatchSize != 1 {
		t.Errorf("MatchSize = %d, want 1", cfg.MatchSize)
	}
	if cfg.PhaseCount != 5 || cfg.PhaseDuration != 90*time.Second || cfg.IntermissionDuration != 500*time.Millisecond {
		t.Errorf("phases = %d, %s, %s", cfg.PhaseCount, cfg.PhaseDuration, cfg.IntermissionDuration)
	}
	if cfg.BypassDuration != 45*time.Second || cfg.FireDuration != 3*time.Second {
		t.Errorf("bypass = %s, fire = %s", cfg.BypassDuration, cfg.FireDuration)
	}
	if cfg.CpuFillAfter != 5*time.Second {
		t.Errorf("CpuFillAfter = %s, want 5s", cfg.CpuFillAfter)
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want []string
	}{
		{
			name: "必須が無い",
			env:  map[string]string{},
			want: []string{"IUBEO_SIGNING_KEY", "IUBEO_ALLOWED_ORIGINS"},
		},
		{
			name: "鍵が短い",
			env:  map[string]string{"IUBEO_SIGNING_KEY": "short", "IUBEO_ALLOWED_ORIGINS": "http://localhost:5173"},
			want: []string{"at least 32 bytes"},
		},
		{
			name: "人数が範囲外",
			env:  map[string]string{"IUBEO_SIGNING_KEY": validKey, "IUBEO_ALLOWED_ORIGINS": "http://localhost:5173", "IUBEO_MATCH_SIZE": "4"},
			want: []string{"IUBEO_MATCH_SIZE"},
		},
		{
			name: "人数が数でない",
			env:  map[string]string{"IUBEO_SIGNING_KEY": validKey, "IUBEO_ALLOWED_ORIGINS": "http://localhost:5173", "IUBEO_MATCH_SIZE": "three"},
			want: []string{"IUBEO_MATCH_SIZE"},
		},
		{
			name: "フェーズの数と長さが不正",
			env: map[string]string{
				"IUBEO_SIGNING_KEY": validKey, "IUBEO_ALLOWED_ORIGINS": "http://localhost:5173",
				"IUBEO_PHASE_COUNT": "0", "IUBEO_PHASE_DURATION": "30", "IUBEO_INTERMISSION_DURATION": "-1s",
				"IUBEO_BYPASS_DURATION": "0s", "IUBEO_FIRE_DURATION": "soon",
			},
			want: []string{"IUBEO_PHASE_COUNT", "IUBEO_PHASE_DURATION", "IUBEO_INTERMISSION_DURATION", "IUBEO_BYPASS_DURATION", "IUBEO_FIRE_DURATION"},
		},
		{
			name: "CPU 埋めの長さが不正",
			env: map[string]string{
				"IUBEO_SIGNING_KEY": validKey, "IUBEO_ALLOWED_ORIGINS": "http://localhost:5173",
				"IUBEO_CPU_FILL_AFTER": "-1s",
			},
			want: []string{"IUBEO_CPU_FILL_AFTER"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Load(env(tt.env))
			if err == nil {
				t.Fatal("Load: want error")
			}
			for _, w := range tt.want {
				if !strings.Contains(err.Error(), w) {
					t.Errorf("error %q does not mention %q", err, w)
				}
			}
		})
	}
}

func TestLoadWisp(t *testing.T) {
	base := map[string]string{
		"IUBEO_SIGNING_KEY":     validKey,
		"IUBEO_ALLOWED_ORIGINS": "http://localhost:5173",
	}

	t.Run("未設定なら WISP は無効", func(t *testing.T) {
		cfg, err := Load(env(base))
		if err != nil {
			t.Fatal(err)
		}
		if cfg.WispKey != nil || cfg.WispURL != "" {
			t.Errorf("WISP should be disabled: key=%q url=%q", cfg.WispKey, cfg.WispURL)
		}
	})

	t.Run("鍵と URL の両方があれば有効", func(t *testing.T) {
		m := map[string]string{"IUBEO_WISP_KEY": validKey, "IUBEO_WISP_URL": "wss://example.test/wisp/", "IUBEO_WISP_PASS": "open-sesame"}
		for k, v := range base {
			m[k] = v
		}
		cfg, err := Load(env(m))
		if err != nil {
			t.Fatal(err)
		}
		if string(cfg.WispKey) != validKey || cfg.WispURL != "wss://example.test/wisp/" || cfg.WispPass != "open-sesame" {
			t.Errorf("WISP config = %q / %q / %q", cfg.WispKey, cfg.WispURL, cfg.WispPass)
		}
	})

	t.Run("鍵だけ・短すぎる鍵はエラー", func(t *testing.T) {
		m := map[string]string{"IUBEO_WISP_KEY": validKey}
		for k, v := range base {
			m[k] = v
		}
		if _, err := Load(env(m)); err == nil || !strings.Contains(err.Error(), "IUBEO_WISP_URL") {
			t.Errorf("want IUBEO_WISP_URL error, got %v", err)
		}
		m["IUBEO_WISP_KEY"] = "short"
		m["IUBEO_WISP_URL"] = "wss://example.test/wisp/"
		if _, err := Load(env(m)); err == nil || !strings.Contains(err.Error(), "IUBEO_WISP_KEY must be") {
			t.Errorf("want key length error, got %v", err)
		}
	})
}
