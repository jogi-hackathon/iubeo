package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"

	"github.com/coder/websocket"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
)

// readLimit は 1 メッセージの受信の上限(バイト)。transform・interact は小さい
const readLimit = 4096

// participantSession は Cookie のプレイヤーが参加しているセッションを返す。
// 無ければ 401 / 404 / 403 を書いて false を返す
func (s *Server) participantSession(w http.ResponseWriter, r *http.Request, sessionID string) (*session.Session, string, bool) {
	playerID, ok := s.authenticate(w, r)
	if !ok {
		return nil, "", false
	}
	sess, ok := s.sessions.Store().Get(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "session not found")
		return nil, "", false
	}
	if !sess.HasPlayer(playerID) {
		writeError(w, http.StatusForbidden, "forbidden", "not a participant of the session")
		return nil, "", false
	}
	return sess, playerID, true
}

// GetSession はセッションのスナップショットを返す(参加者のみ)
func (s *Server) GetSession(w http.ResponseWriter, r *http.Request, sessionID api.SessionId) {
	sess, _, ok := s.participantSession(w, r, sessionID)
	if !ok {
		return
	}
	snap, err := sess.Snapshot(r.Context())
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "session has ended")
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

// ConnectSession は WebSocket に切り替え、セッションにつなぐ(参加者のみ。Origin を検証する)
func (s *Server) ConnectSession(w http.ResponseWriter, r *http.Request, sessionID api.SessionId) {
	sess, playerID, ok := s.participantSession(w, r, sessionID)
	if !ok {
		return
	}
	if origin := r.Header.Get("Origin"); !slices.Contains(s.allowedOrigins, origin) {
		writeError(w, http.StatusForbidden, "forbidden_origin", "origin is not allowed")
		return
	}
	// Origin は上で許可リストと完全一致で確かめたので、ライブラリの同一ホストの検証は使わない
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	ws.SetReadLimit(readLimit)

	// WriteLoop はハンドラーが戻った後も close を送り終えるまで動くので、リクエストの context から切り離す
	ctx, cancel := context.WithCancel(context.WithoutCancel(r.Context()))
	defer cancel()
	conn := session.NewConn(playerID, ws)
	// enc=bin の接続は、位置のメッセージをバイナリでやり取りする(session/binary.go。state-schema.md §7.5)
	conn.Binary = r.URL.Query().Get("enc") == "bin"
	go conn.WriteLoop(ctx)
	go func() {
		select {
		case <-sess.Done():
			conn.Close(session.CloseSessionEnded, "ended")
		case <-conn.Done():
		}
	}()
	if err := sess.Attach(conn); err != nil {
		conn.Close(session.CloseSessionEnded, "ended")
		return
	}
	defer sess.Detach(conn)

	s.readLoop(ctx, ws, sess, conn)
}

// readLoop は受信したメッセージをセッションに渡す。接続が切れるか切られたら戻る
func (s *Server) readLoop(ctx context.Context, ws *websocket.Conn, sess *session.Session, conn *session.Conn) {
	for {
		typ, data, err := ws.Read(ctx)
		if err != nil {
			conn.Close(websocket.StatusNormalClosure, "")
			return
		}
		if typ == websocket.MessageBinary {
			err = sess.ReceiveBinary(conn.PlayerID, data)
		} else {
			err = sess.ReceiveJSON(conn.PlayerID, data)
		}
		if errors.Is(err, session.ErrEnded) {
			return
		}
		if err != nil {
			slog.Debug("invalid client message", "player", conn.PlayerID, "err", err)
			conn.SendError("invalid_message", err.Error())
		}
	}
}
