// Command server は IUBEO のゲームバックエンドを起動する。
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/config"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/server"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/voice"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		slog.Error("invalid config", "err", err)
		os.Exit(1)
	}
	sessionConfig := session.DefaultConfig
	sessionConfig.Phases = session.PhaseRules{
		Count:        cfg.PhaseCount,
		Duration:     cfg.PhaseDuration,
		Intermission: cfg.IntermissionDuration,
		Bypass:       cfg.BypassDuration,
		Fire:         cfg.FireDuration,
	}
	sessions := session.NewManager(session.NewMemoryStore(), time.Now, sessionConfig)
	srv := server.New(
		player.NewSigner(cfg.SigningKey),
		sessions,
		matchmaking.New(cfg.MatchSize, sessions, time.Now, matchmaking.Options{FillAfter: cfg.CpuFillAfter}),
		cfg.AllowedOrigins,
	)
	if cfg.WispKey != nil {
		srv.WithWisp(wisp.NewIssuer(cfg.WispKey, wisp.DefaultTTL, time.Now), cfg.WispURL, cfg.WispPass)
	}
	if cfg.VCSeed != nil {
		issuer, err := voice.NewIssuer(cfg.VCSeed, "", voice.DefaultTTL, time.Now)
		if err != nil {
			slog.Error("invalid VC key", "err", err)
			os.Exit(1)
		}
		srv.WithVoice(issuer, cfg.VCSignalingURL, cfg.VCMediaURL)
	}
	slog.Info("listening", "addr", cfg.Addr, "matchSize", cfg.MatchSize, "allowedOrigins", cfg.AllowedOrigins,
		"phases", cfg.PhaseCount, "phaseDuration", cfg.PhaseDuration, "intermission", cfg.IntermissionDuration,
		"bypass", cfg.BypassDuration, "fire", cfg.FireDuration)
	if err := http.ListenAndServe(cfg.Addr, srv.Handler()); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
