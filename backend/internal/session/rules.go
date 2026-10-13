package session

import (
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

type Input interface{ isInput() }

type Connect struct {
	PlayerID string
	ConnID   uint64
	Now      time.Time
}

type Disconnect struct {
	PlayerID string
	ConnID   uint64
	Now      time.Time
}

type ClientTransform struct {
	PlayerID string
	Msg      api.TransformMessage
}

type ClientInteract struct {
	PlayerID string
	Msg      api.InteractMessage
	Now      time.Time
	NewID    string
}

type Tick struct {
	Now time.Time
}

func (Connect) isInput()         {}
func (Disconnect) isInput()      {}
func (ClientTransform) isInput() {}
func (ClientInteract) isInput()  {}
func (Tick) isInput()            {}

type Output interface{ isOutput() }

type Send struct {
	To  string
	Msg any
}

type Broadcast struct {
	Msg    any
	Except string
}

type CloseConn struct {
	ConnID uint64
	Reason CloseReason
}

type End struct {
	Reason CloseReason
}

func (Send) isOutput()      {}
func (Broadcast) isOutput() {}
func (CloseConn) isOutput() {}
func (End) isOutput()       {}

type CloseReason string

const (
	ReasonReplaced  CloseReason = "replaced"
	ReasonDissolved CloseReason = "dissolved"
	ReasonAbandoned CloseReason = "abandoned"
	ReasonFinished  CloseReason = "finished"
)

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

func (st *State) tick(in Tick) []Output {
	if st.Status == api.SessionStatusWaiting && !in.Now.Before(st.CreatedAt.Add(st.StartTimeout)) {
		st.Ended = true
		return []Output{End{Reason: ReasonDissolved}}
	}
	if !st.AllDisconnectedAt.IsZero() && !in.Now.Before(st.AllDisconnectedAt.Add(st.AbandonTimeout)) {
		st.Ended = true
		return []Output{End{Reason: ReasonAbandoned}}
	}

	out := st.finishActions(in.Now)
	out = append(out, st.cpuStep(in.Now)...)

	msg := api.TransformsMessage{Type: api.Transforms, ServerTime: in.Now}
	for i := range st.Players {
		p := &st.Players[i]
		if !p.moved {
			continue
		}
		p.moved = false
		msg.Players = append(msg.Players, struct {
			PlayerId  api.PlayerId  `json:"playerId"` //nolint:revive
			Transform api.Transform `json:"transform"`
		}{PlayerId: p.ID, Transform: cloneTransform(p.Transform)})
	}
	if len(msg.Players) > 0 {
		out = append(out, Broadcast{Msg: msg})
	}
	return out
}
