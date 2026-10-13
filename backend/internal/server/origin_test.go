package server

import (
	"regexp"
	"testing"
)

func TestOriginAllowed(t *testing.T) {
	s := New(nil, nil, nil, []string{"https://iubeo.thirdlf03.com"}).
		WithOriginRegexps([]*regexp.Regexp{
			regexp.MustCompile(`^(?:https://pr-[0-9]+-iubeo-frontend\.example\.workers\.dev)$`),
		})

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{"完全一致の本番", "https://iubeo.thirdlf03.com", true},
		{"パターンに合う PR プレビュー", "https://pr-123-iubeo-frontend.example.workers.dev", true},
		{"パターンの途中まで一致は不可", "https://pr-123-iubeo-frontend.example.workers.dev.evil.test", false},
		{"パターンに合わない別 PR 名", "https://pr-abc-iubeo-frontend.example.workers.dev", false},
		{"空の Origin は不可", "", false},
		{"許可していない Origin", "http://evil.example", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := s.originAllowed(tt.origin); got != tt.want {
				t.Errorf("originAllowed(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}
