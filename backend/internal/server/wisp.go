package server

import (
	"net/http"
	"net/url"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/wisp"
)

// WithWisp は WISP 接続用のトークンを発行できるようにする。baseURL は WISP の WebSocket の基点で、
// トークンは `token` のクエリに付けて返す。issuer が nil のままなら 503 を返す。
func (s *Server) WithWisp(issuer *wisp.Issuer, baseURL string) *Server {
	s.wisp = issuer
	s.wispURL = baseURL
	return s
}

// GetWispToken は、Cookie のあるプレイヤーに、WISP へ繋ぐ URL(期限つきトークン入り)を返す。
//
// いまは「ルームに入った人」= プレイヤーの Cookie がある人に発行する(合言葉は廃止)。
// チュートリアルを入れたら「セッション中・マッチング中・チュートリアル中」だけに絞る(TODO)。
// WISP をオープンプロキシにしないための実質の門は、ここで発行する期限つきトークンを WISP 側が
// 共有鍵で検証すること(wisp/token.mjs)。
func (s *Server) GetWispToken(w http.ResponseWriter, r *http.Request) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
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
