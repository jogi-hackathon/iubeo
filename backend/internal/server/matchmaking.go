package server

import (
	"errors"
	"net/http"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/matchmaking"
)

func matchmakingStatus(st matchmaking.State) api.MatchmakingStatus {
	if st.SessionID == "" {
		return api.MatchmakingStatus{Status: api.Queued, QueuedAt: st.QueuedAt}
	}
	return api.MatchmakingStatus{Status: api.Matched, QueuedAt: st.QueuedAt, SessionId: &st.SessionID}
}

func writeMatchmakingError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, matchmaking.ErrInSession):
		writeError(w, http.StatusConflict, "in_session", err.Error())
	case errors.Is(err, matchmaking.ErrMatched):
		writeError(w, http.StatusConflict, "matched", err.Error())
	case errors.Is(err, matchmaking.ErrNotQueued):
		writeError(w, http.StatusNotFound, "not_queued", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
	}
}

// JoinMatchmaking は自動マッチングの待機列に入る
func (s *Server) JoinMatchmaking(w http.ResponseWriter, r *http.Request) {
	id, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	st, err := s.matchmaker.Join(id)
	if err != nil {
		writeMatchmakingError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, matchmakingStatus(st))
}

// GetMatchmaking は自分のマッチング状況を返す(ポーリング用)
func (s *Server) GetMatchmaking(w http.ResponseWriter, r *http.Request) {
	id, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	st, err := s.matchmaker.Get(id)
	if err != nil {
		writeMatchmakingError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, matchmakingStatus(st))
}

// LeaveMatchmaking は待機をやめる
func (s *Server) LeaveMatchmaking(w http.ResponseWriter, r *http.Request) {
	id, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if err := s.matchmaker.Leave(id); err != nil {
		writeMatchmakingError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
