package server

func (s *Server) eligibleForWisp(playerID string) bool {
	if _, in := s.sessions.SessionOf(playerID); in {
		return true
	}
	if _, err := s.matchmaker.Get(playerID); err == nil {
		return true
	}
	return s.tutorialPresence.Active(playerID)
}
