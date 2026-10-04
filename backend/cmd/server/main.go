// Command server は IUBEO のゲームバックエンドを起動する。
package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/jogi-hackathon/iubeo/backend/internal/config"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/server"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		slog.Error("invalid config", "err", err)
		os.Exit(1)
	}
	srv := server.New(player.NewSigner(cfg.SigningKey))
	slog.Info("listening", "addr", cfg.Addr, "matchSize", cfg.MatchSize, "allowedOrigins", cfg.AllowedOrigins)
	if err := http.ListenAndServe(cfg.Addr, srv.Handler()); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
