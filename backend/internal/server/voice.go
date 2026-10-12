package server

import (
	"net/http"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/voice"
)

// WithVoice は Voice Chat のトークンを発行できるようにする。設定が揃っていなければ
// GetVoiceToken は 200 で available: false を返す(503 ではない)。
func (s *Server) WithVoice(issuer *voice.Issuer, signalingURL, mediaURL string) *Server {
	s.voice = issuer
	s.voiceSignalingURL = signalingURL
	s.voiceMediaURL = mediaURL
	return s
}

func (s *Server) GetVoiceToken(w http.ResponseWriter, r *http.Request) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if s.voice == nil || s.voiceSignalingURL == "" || s.voiceMediaURL == "" {
		reason := "voice chat is not configured"
		writeJSON(w, http.StatusOK, api.VoiceUnavailable{Available: false, Reason: &reason})
		return
	}
	sessionID, ok := s.sessions.SessionOf(playerID)
	if !ok {
		writeError(w, http.StatusForbidden, "not_in_session", "player is not in a session")
		return
	}
	token, expiresAt, err := s.voice.Issue(playerID, sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not issue voice token")
		return
	}
	writeJSON(w, http.StatusOK, api.VoiceToken{
		Available:    true,
		Token:        token,
		Room:         sessionID,
		SignalingUrl: s.voiceSignalingURL,
		MediaUrl:     s.voiceMediaURL,
		ExpiresAt:    expiresAt,
	})
}
