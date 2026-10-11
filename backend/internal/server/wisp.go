package server

import (
	"net/http"
	"net/url"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

func (s *Server) WithWisp(issuer *wisp.Issuer, baseURL string) *Server {
	s.wisp = issuer
	s.wispURL = baseURL
	return s
}

// WISP をオープンプロキシにしないための実質の門は、ここで発行する期限つきトークンを WISP 側が
// 共有鍵で検証すること(wisp/token.mjs)。発行はセッション中・マッチング待機/成立後・チュートリアル中
// (クライアント heartbeat) に限る。
func (s *Server) GetWispToken(w http.ResponseWriter, r *http.Request) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if !s.eligibleForWisp(playerID) {
		writeError(w, http.StatusForbidden, "not_eligible", "player is not in a session, matchmaking, or tutorial")
		return
	}
	if s.wisp == nil {
		writeError(w, http.StatusServiceUnavailable, "wisp_unavailable", "wisp is not configured")
		return
	}
	token, expiresAt, err := s.wisp.Issue(playerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not issue wisp token")
		return
	}
	u, err := url.Parse(s.wispURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "wisp url is invalid")
		return
	}
	q := u.Query()
	q.Set("token", token)
	u.RawQuery = q.Encode()
	writeJSON(w, http.StatusOK, api.WispToken{Url: u.String(), ExpiresAt: expiresAt})
}
