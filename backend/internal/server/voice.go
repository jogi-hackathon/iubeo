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
// (vc の /v1/moq/auth)。セッションに居ない人には発行しない。
// VC を設定していないサーバーでは、200 で available=false を返す(クライアントが毎回
// コンソールにエラーを出さないため。詳しくは openapi.yaml の説明)
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
