// Package server は api.ServerInterface を実装し、HTTP のエンドポイントをつなぐ。
package server

import (
	"encoding/json"
	"net/http"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

// Server は api.ServerInterface の実装。実装していないエンドポイントは 501 を返す
type Server struct {
	signer     *player.Signer
	sessions   *session.Manager
	matchmaker *matchmaking.Matchmaker
	// allowedOrigins は WebSocket の接続を許すオリジン(完全一致)
	allowedOrigins []string
	// wisp は WISP 接続用のトークンを発行する(nil なら未設定)。wispURL は WISP の基点
	wisp    *wisp.Issuer
	wispURL string
}

var _ api.ServerInterface = (*Server)(nil)

// New は Server を作る
func New(signer *player.Signer, sessions *session.Manager, matchmaker *matchmaking.Matchmaker, allowedOrigins []string) *Server {
	return &Server{signer: signer, sessions: sessions, matchmaker: matchmaker, allowedOrigins: allowedOrigins}
}

// Handler は Server の HTTP ハンドラーを返す
func (s *Server) Handler() http.Handler {
	return api.Handler(s)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, api.Error{Code: code, Message: message})
}

func notImplemented(w http.ResponseWriter) {
	writeError(w, http.StatusNotImplemented, "not_implemented", "not implemented")
}

// authenticate は Cookie からプレイヤーを決める。無効なら 401 を書いて false を返す
func (s *Server) authenticate(w http.ResponseWriter, r *http.Request) (string, bool) {
	id, ok := s.signer.FromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "player cookie is missing or invalid")
	}
	return id, ok
}

func (s *Server) GetHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// CreateSession(シングルモード)は未実装
func (s *Server) CreateSession(w http.ResponseWriter, _ *http.Request) { notImplemented(w) }
