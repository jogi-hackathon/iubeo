package server

func (s *Server) eligibleForWisp(playerID string) bool {
	// マッチングは Enrolled(読むだけ)を使う。Get だと lastSeen を延命し、CPU の補充まで走るので、
	// トークンの問い合わせが待機列や試合の進行に影響してしまう
	if _, in := s.sessions.SessionOf(playerID); in {
		return true
	}
	if s.matchmaker.Enrolled(playerID) {
		return true
	}
	return s.tutorialPresence.Active(playerID)
}
