package server

import (
	"crypto/subtle"
	"net/http"
	"net/url"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

// WithWisp は WISP 接続用のトークンを発行できるようにする。baseURL は WISP の WebSocket の基点で、
// トークンは `token` のクエリに付けて返す。issuer が nil のままなら 503 を返す。
// pass が空でなければ、X-Iubeo-Wisp-Pass でそれを送った人にだけ発行する(違えば 403)
func (s *Server) WithWisp(issuer *wisp.Issuer, baseURL, pass string) *Server {
	s.wisp = issuer
	s.wispURL = baseURL
	s.wispPass = pass
	return s
}

// GetWispToken は、Cookie のあるプレイヤーに、WISP へ繋ぐ URL(期限つきトークン入り)を返す
func (s *Server) GetWispToken(w http.ResponseWriter, r *http.Request, params api.GetWispTokenParams) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if s.wisp == nil {
		writeError(w, http.StatusServiceUnavailable, "wisp_unavailable", "wisp is not configured")
		return
	}
	if !s.wispPassMatches(params.XIubeoWispPass) {
		writeError(w, http.StatusForbidden, "forbidden", "wisp pass is missing or wrong")
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

// wispPassMatches は合言葉が合っているか。合言葉が設定されていなければ、常に合っている
func (s *Server) wispPassMatches(got *string) bool {
	if s.wispPass == "" {
		return true
	}
	return got != nil && subtle.ConstantTimeCompare([]byte(*got), []byte(s.wispPass)) == 1
}
