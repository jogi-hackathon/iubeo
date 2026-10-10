package server

import (
	"net/http"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/player"
)

func (s *Server) me(playerID string) api.Me {
	me := api.Me{PlayerId: playerID}
	if id, ok := s.sessions.SessionOf(playerID); ok {
		me.SessionId = &id
	}
	return me
}

// CreatePlayer は匿名プレイヤーを作り Cookie を発行する。有効な Cookie があればそのプレイヤーを返す
func (s *Server) CreatePlayer(w http.ResponseWriter, r *http.Request) {
	if id, ok := s.signer.FromRequest(r); ok {
		writeJSON(w, http.StatusOK, s.me(id))
		return
	}
	id := player.NewID()
	s.signer.SetCookie(w, id)
	writeJSON(w, http.StatusCreated, s.me(id))
}

// GetMe は自分の ID と参加中のセッションを返す
func (s *Server) GetMe(w http.ResponseWriter, r *http.Request) {
	id, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, s.me(id))
}
