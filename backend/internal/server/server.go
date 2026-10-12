package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
	"github.com/jogi-hackathon/iubeo/backend/internal/search"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
	"github.com/jogi-hackathon/iubeo/backend/internal/tutorial"
	"github.com/jogi-hackathon/iubeo/backend/internal/voice"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

type Server struct {
	signer            *player.Signer
	sessions          *session.Manager
	matchmaker        *matchmaking.Matchmaker
	tutorialPresence  *tutorial.Presence
	allowedOrigins    []string
	wisp              *wisp.Issuer
	wispURL           string
	voice             *voice.Issuer
	voiceSignalingURL string
	voiceMediaURL     string
	searcher          search.Client
	searchLimiter     *search.Limiter
}

var _ api.ServerInterface = (*Server)(nil)

func New(signer *player.Signer, sessions *session.Manager, matchmaker *matchmaking.Matchmaker, allowedOrigins []string) *Server {
	return &Server{
		signer:           signer,
		sessions:         sessions,
		matchmaker:       matchmaker,
		tutorialPresence: tutorial.NewPresence(time.Now, tutorial.StaleAfter),
		allowedOrigins:   allowedOrigins,
		searchLimiter:    search.NewLimiter(searchLimitPerWindow, searchWindow, time.Now),
	}
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
