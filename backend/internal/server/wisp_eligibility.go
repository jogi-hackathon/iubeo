package server

func (s *Server) eligibleForWisp(playerID string) bool {
	if _, in := s.sessions.SessionOf(playerID); in {
		return true
	}
	if s.matchmaker.Enrolled(playerID) {
		return true
	}
	return s.tutorialPresence.Active(playerID)
}
