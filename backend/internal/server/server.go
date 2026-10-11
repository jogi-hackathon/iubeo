package server

import (
	"encoding/json"
	"net/http"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/voice"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

type Server struct {
	signer            *player.Signer
	sessions          *session.Manager
	matchmaker        *matchmaking.Matchmaker
	allowedOrigins    []string
	wisp              *wisp.Issuer
	wispURL           string
	voice             *voice.Issuer
	voiceSignalingURL string
	voiceMediaURL     string
}

var _ api.ServerInterface = (*Server)(nil)

func New(signer *player.Signer, sessions *session.Manager, matchmaker *matchmaking.Matchmaker, allowedOrigins []string) *Server {
	return &Server{signer: signer, sessions: sessions, matchmaker: matchmaker, allowedOrigins: allowedOrigins}
}

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

func (s *Server) CreateSession(w http.ResponseWriter, _ *http.Request) { notImplemented(w) }
