package session

import (
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// ---------- 入力 ----------

// Input はセッションへの入力。セッションの goroutine が 1 つのチャネルから順番に Step に渡す
type Input interface{ isInput() }

// Connect はプレイヤーの WebSocket が接続した
type Connect struct {
	PlayerID string
	ConnID   uint64
	Now      time.Time
}

// Disconnect はプレイヤーの WebSocket が切れた
type Disconnect struct {
	PlayerID string
	ConnID   uint64
	Now      time.Time
}

// ClientTransform はプレイヤーから届いた transform
type ClientTransform struct {
	PlayerID string
	Msg      api.TransformMessage
}

// ClientInteract はプレイヤーから届いた interact。Now と NewID はセッションの goroutine が受け取ったときに入れる
type ClientInteract struct {
	PlayerID string
	Msg      api.InteractMessage
	Now      time.Time
	// NewID は新しいファイルを作るときに使う id(Step を純粋に保つため、採番は外で行う)
	NewID string
}

// Tick は時間の経過(transforms の配信と、開始・破棄の期限の確認)。最大 20Hz
type Tick struct {
	Now time.Time
}

func (Connect) isInput()         {}
func (Disconnect) isInput()      {}
func (ClientTransform) isInput() {}
func (ClientInteract) isInput()  {}
func (Tick) isInput()            {}

// ---------- 出力 ----------

// Output は Step の結果として、セッションの goroutine が行うこと
type Output interface{ isOutput() }

// Send は 1 人に送る
type Send struct {
	To  string
	Msg any
}

// Broadcast は接続している全員に送る。Except のプレイヤーには送らない
type Broadcast struct {
	Msg    any
	Except string
}

// CloseConn は接続を切る
type CloseConn struct {
	ConnID uint64
	Reason CloseReason
}

// End はセッションを終える(送信キューに残ったメッセージを送ってから全員の接続を切り、破棄する)
type End struct {
	Reason CloseReason
}

func (Send) isOutput()      {}
func (Broadcast) isOutput() {}
func (CloseConn) isOutput() {}
func (End) isOutput()       {}

// CloseReason は接続を切る理由。WebSocket の close の reason にそのまま入れる
type CloseReason string

const (
	// ReasonReplaced は同じプレイヤーが新しい接続を開いた
	ReasonReplaced CloseReason = "replaced"
	// ReasonDissolved は開始までに人間全員がそろわず、セッションを解散した
	ReasonDissolved CloseReason = "dissolved"
	// ReasonAbandoned は人間が全員切断したまま戻らず、セッションを破棄した
	ReasonAbandoned CloseReason = "abandoned"
	// ReasonFinished は決着がつき、session.finished を送ってセッションを終えた
	ReasonFinished CloseReason = "finished"
)

// ---------- 規則 ----------

// Step は「状態 + 入力 → 新しい状態 + 行うこと」の純粋な関数。st は書き換えない
func Step(st State, in Input) (State, []Output) {
	if st.Ended {
		return st, nil
	}
	next := st.clone()
	var out []Output
	if now, ok := inputTime(in); ok {
		out = next.advance(now)
		if next.Ended {
			return next, out
		}
	}
	switch in := in.(type) {
	case Connect:
		out = append(out, next.connect(in)...)
	case Disconnect:
		out = append(out, next.disconnect(in)...)
	case ClientTransform:
		out = append(out, next.transform(in)...)
	case ClientInteract:
		out = append(out, next.interact(in)...)
	case Tick:
		out = append(out, next.tick(in)...)
	}
	return next, out
}

// inputTime は入力の時刻を返す。transform は時刻を持たない
func inputTime(in Input) (time.Time, bool) {
	switch in := in.(type) {
	case Connect:
		return in.Now, true
	case Disconnect:
		return in.Now, true
	case ClientInteract:
		return in.Now, true
	case Tick:
		return in.Now, true
	}
	return time.Time{}, false
}

func (st *State) nextSeq() int64 {
	st.Seq++
	return st.Seq
}

func (st *State) playerUpdated(p *PlayerState) api.PlayerUpdatedMessage {
	return api.PlayerUpdatedMessage{Type: api.PlayerUpdated, Seq: st.nextSeq(), Player: st.playerStatus(*p)}
}

func (st *State) humans(pred func(PlayerState) bool) bool {
	for _, p := range st.Players {
		if p.Kind == api.Human && !pred(p) {
			return false
		}
	}
	return true
}

// connect: 同じプレイヤーの古い接続は切る。本人には snapshot、他の人には player.updated を送る。
// 開始前に人間全員がそろったら playing にして session.started を送り、第1フェーズを始める
func (st *State) connect(in Connect) []Output {
	p := st.player(in.PlayerID)
	if p == nil {
		return nil
	}
	var out []Output
	if p.ConnID != 0 && p.ConnID != in.ConnID {
		out = append(out, CloseConn{ConnID: p.ConnID, Reason: ReasonReplaced})
	}
	p.ConnID = in.ConnID
	st.AllDisconnectedAt = time.Time{}
	if p.Connection != api.Connected {
		p.Connection = api.Connected
		out = append(out, Broadcast{Msg: st.playerUpdated(p), Except: p.ID})
	}
	out = append(out, Send{To: p.ID, Msg: api.SnapshotMessage{Type: api.Snapshot, Session: st.Snapshot(in.Now)}})

	if st.Status == api.SessionStatusWaiting && st.humans(func(p PlayerState) bool { return p.Connection == api.Connected }) {
		st.Status = api.SessionStatusPlaying
		st.StartedAt = in.Now
		out = append(out, Broadcast{Msg: api.SessionStartedMessage{Type: api.SessionStarted, Seq: st.nextSeq(), StartedAt: in.Now}})
		out = append(out, st.startPhase(1, in.Now)...)
	}
	return out
}

// disconnect: 今の接続が切れたときだけ disconnected にする(置き換えられた古い接続は無視する)。
// 作業を取りやめ、手持ちのファイルはディレクトリに戻す
func (st *State) disconnect(in Disconnect) []Output {
	p := st.player(in.PlayerID)
	if p == nil || p.ConnID != in.ConnID {
		return nil
	}
	p.ConnID = 0
	p.Connection = api.Disconnected
	out := st.releasePlayer(p)
	out = append(out, Broadcast{Msg: st.playerUpdated(p)})
	if st.humans(func(p PlayerState) bool { return p.Connection != api.Connected }) {
		st.AllDisconnectedAt = in.Now
	}
	return out
}

func errorMessage(code, message string) api.ErrorMessage {
	return api.ErrorMessage{Type: api.ErrorMessageTypeError, Code: code, Message: message}
}

// transform: seq が増えない更新は捨てる。配信は次の Tick でまとめて行う
func (st *State) transform(in ClientTransform) []Output {
	p := st.player(in.PlayerID)
	if p == nil {
		return nil
	}
	if len(in.Msg.Position) != 3 {
		return []Output{Send{To: p.ID, Msg: errorMessage("invalid_message", "transform.position must have 3 elements")}}
	}
	if p.reported && in.Msg.Seq <= p.Transform.Seq {
		return nil
	}
	p.reported = true
	p.moved = true
	p.Transform = api.Transform{Position: in.Msg.Position, Yaw: in.Msg.Yaw, Pitch: in.Msg.Pitch, Seq: in.Msg.Seq}
	return nil
}

// tick: (フェーズの締切と intermission の終わりは Step が先に advance で処理する)開始と破棄の期限を確かめ、期限が来たワークスペースのアクションを終え、前回から動いたプレイヤーの transforms を配る
func (st *State) tick(in Tick) []Output {
	if st.Status == api.SessionStatusWaiting && !in.Now.Before(st.CreatedAt.Add(st.StartTimeout)) {
		st.Ended = true
		return []Output{End{Reason: ReasonDissolved}}
	}
	if !st.AllDisconnectedAt.IsZero() && !in.Now.Before(st.AllDisconnectedAt.Add(st.AbandonTimeout)) {
		st.Ended = true
		return []Output{End{Reason: ReasonAbandoned}}
	}

	out := st.finishWorkspaceActions(in.Now)

	msg := api.TransformsMessage{Type: api.Transforms, ServerTime: in.Now}
	for i := range st.Players {
		p := &st.Players[i]
		if !p.moved {
			continue
		}
		p.moved = false
		msg.Players = append(msg.Players, struct {
			PlayerId  api.PlayerId  `json:"playerId"`
			Transform api.Transform `json:"transform"`
		}{PlayerId: p.ID, Transform: cloneTransform(p.Transform)})
	}
	if len(msg.Players) > 0 {
		out = append(out, Broadcast{Msg: msg})
	}
	return out
}
