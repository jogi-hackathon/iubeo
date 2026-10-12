package server

import "net/http"

func (s *Server) TouchTutorialPresence(w http.ResponseWriter, r *http.Request) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.tutorialPresence.Touch(playerID)
	w.WriteHeader(http.StatusNoContent)
}
