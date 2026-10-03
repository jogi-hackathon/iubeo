// Command server は IUBEO のゲームバックエンドを起動する。
package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// server は api.ServerInterface の実装。各エンドポイントは実装するまで 501 を返す
type server struct{}

var _ api.ServerInterface = server{}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func notImplemented(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotImplemented, api.Error{Code: "not_implemented", Message: "not implemented"})
}

func (server) GetHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (server) CreatePlayer(w http.ResponseWriter, _ *http.Request)     { notImplemented(w) }
func (server) GetMe(w http.ResponseWriter, _ *http.Request)            { notImplemented(w) }
func (server) JoinMatchmaking(w http.ResponseWriter, _ *http.Request)  { notImplemented(w) }
func (server) GetMatchmaking(w http.ResponseWriter, _ *http.Request)   { notImplemented(w) }
func (server) LeaveMatchmaking(w http.ResponseWriter, _ *http.Request) { notImplemented(w) }
func (server) CreateSession(w http.ResponseWriter, _ *http.Request)    { notImplemented(w) }
func (server) GetSession(w http.ResponseWriter, _ *http.Request, _ api.SessionId) {
	notImplemented(w)
}
func (server) ConnectSession(w http.ResponseWriter, _ *http.Request, _ api.SessionId) {
	notImplemented(w)
}

func main() {
	addr := os.Getenv("IUBEO_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	slog.Info("listening", "addr", addr)
	if err := http.ListenAndServe(addr, api.Handler(server{})); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
