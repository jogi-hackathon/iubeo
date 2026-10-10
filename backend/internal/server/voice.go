package server

import (
	"net/http"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/voice"
)

// WithVoice は Voice Chat のトークンを発行できるようにする。issuer が nil のままなら 503 を返す
func (s *Server) WithVoice(issuer *voice.Issuer, signalingURL, mediaURL string) *Server {
	s.voice = issuer
	s.voiceSignalingURL = signalingURL
	s.voiceMediaURL = mediaURL
	return s
}

// GetVoiceToken は、セッションに参加しているプレイヤーに、VC のトークンと接続先を返す。
// room はセッション id で、moq-relay はそのルームの中でだけ publish/subscribe を許す
// (vc の /v1/moq/auth)。セッションに居ない人には発行しない
func (s *Server) GetVoiceToken(w http.ResponseWriter, r *http.Request) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if s.voice == nil || s.voiceSignalingURL == "" || s.voiceMediaURL == "" {
		writeError(w, http.StatusServiceUnavailable, "voice_unavailable", "voice chat is not configured")
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
		Token:        token,
		Room:         sessionID,
		SignalingUrl: s.voiceSignalingURL,
		MediaUrl:     s.voiceMediaURL,
		ExpiresAt:    expiresAt,
	})
}
