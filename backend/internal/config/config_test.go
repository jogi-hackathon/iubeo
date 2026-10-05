package config

import (
	"slices"
	"strings"
	"testing"
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
	if string(cfg.SigningKey) != validKey {
		t.Errorf("SigningKey = %q", cfg.SigningKey)
	}
}

func TestLoadAll(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"IUBEO_ADDR":            "127.0.0.1:9000",
		"IUBEO_SIGNING_KEY":     validKey,
		"IUBEO_ALLOWED_ORIGINS": " http://localhost:5173 , https://iubeo.example ,",
		"IUBEO_MATCH_SIZE":      "1",
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
