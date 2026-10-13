package server

import (
	"encoding/json"
	"net/http"
	"regexp"
	"slices"
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
	originRegexps     []*regexp.Regexp
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

// WithOriginRegexps は、完全一致の許可リストに加えて正規表現で許可する Origin を足す
func (s *Server) WithOriginRegexps(res []*regexp.Regexp) *Server {
	s.originRegexps = res
	return s
}

// originAllowed は WebSocket 接続の Origin を許可リストと照合する。空の Origin は許可しない
func (s *Server) originAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	if slices.Contains(s.allowedOrigins, origin) {
		return true
	}
	for _, re := range s.originRegexps {
		if re.MatchString(origin) {
			return true
		}
	}
	return false
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
