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
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		slog.Error("invalid config", "err", err)
		os.Exit(1)
	}
	sessions := session.NewManager(session.NewMemoryStore(), time.Now, session.DefaultConfig)
	srv := server.New(
		player.NewSigner(cfg.SigningKey),
		sessions,
		matchmaking.New(cfg.MatchSize, sessions, time.Now),
		cfg.AllowedOrigins,
	)
	slog.Info("listening", "addr", cfg.Addr, "matchSize", cfg.MatchSize, "allowedOrigins", cfg.AllowedOrigins)
	if err := http.ListenAndServe(cfg.Addr, srv.Handler()); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
