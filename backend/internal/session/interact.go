package session

import (
	"slices"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// WorkspaceActionDuration はワークスペースのアクション(編集・新規作成)にかかる時間。
// フロントの WORKSPACE_ACTION_MS と同じ。結果はこの後に反映する(state-schema.md §5.4)
const WorkspaceActionDuration = 2 * time.Second

// CanvasActionDuration はキャンバスのアクション(画像生成)にかかる時間。
// フロントの CANVAS_ACTION_MS と同じ。結果はこの後に反映する(state-schema.md §5.4.1)
const CanvasActionDuration = 2 * time.Second

// ObjectAction は作業中のワークスペース・キャンバスのアクション。DueAt を過ぎた Tick で結果を適用する
type ObjectAction struct {
	ObjectID string
	PlayerID string
	// EditingID は編集するファイルの id。空なら新規作成
	EditingID string
	// NewID は新規作成で作るファイルの id(受け付けたときに採番しておく)
	NewID string
	// Creates は新規作成で作るファイルの状態(ワークスペースは file_created、キャンバスは image_created)
	Creates api.FileStatus
	DueAt   time.Time
}

func (st *State) object(id string) *ObjectState {
	i := slices.IndexFunc(st.Objects, func(o ObjectState) bool { return o.ID == id })
	if i < 0 {
		return nil
	}
	return &st.Objects[i]
}

func (st *State) item(id string) *ItemState {
	i := slices.IndexFunc(st.Items, func(it ItemState) bool { return it.ID == id })
	if i < 0 {
		return nil
	}
	return &st.Items[i]
}

func (st *State) held(playerID string) *ItemState {
	i := slices.IndexFunc(st.Items, func(it ItemState) bool {
		return it.Location.Kind == HeldBy && it.Location.PlayerID == playerID
	})
	if i < 0 {
		return nil
	}
	return &st.Items[i]
}

func claimMatches(claim *api.HeldItemRef, actual *ItemState) bool {
	if claim == nil || actual == nil {
		return claim == nil && actual == nil
	}
	return claim.Id == actual.ID && claim.Kind == actual.Kind
}

func (st *State) objectUpsert(o *ObjectState) api.ObjectUpsertMessage {
	return api.ObjectUpsertMessage{Type: api.ObjectUpsert, Seq: st.nextSeq(), Object: st.gameObject(*o)}
}

func reject(playerID, objectID string, reason api.RejectReason) []Output {
	return []Output{Send{To: playerID, Msg: api.InteractRejectedMessage{Type: api.ObjectInteractRejected, ObjectId: objectID, Reason: reason}}}
}

func (st *State) interact(in ClientInteract) []Output {
	p := st.player(in.PlayerID)
	if p == nil {
		return nil
	}
	objectID := in.Msg.ObjectId
	if st.Status != api.SessionStatusPlaying || p.Life != api.Alive {
		return reject(p.ID, objectID, api.RejectReasonUnavailable)
	}
	o := st.object(objectID)
	if o == nil {
		return reject(p.ID, objectID, api.RejectReasonNotFound)
	}
	if o.Scope == api.Personal && o.Owner != p.ID {
		return reject(p.ID, objectID, api.RejectReasonNotOwner)
	}
	if o.Availability == api.ObjectAvailabilityUnavailable {
		return reject(p.ID, objectID, api.RejectReasonUnavailable)
	}
	switch o.Kind {
	case api.Directory:
		return st.interactDirectory(p, o, in)
	case api.Workspace:
		return st.interactWorkspace(p, o, in)
	case api.Canvas:
		return st.interactCanvas(p, o, in)
	case api.LighterStand:
		return st.interactLighterStand(p, o, in)
	}
	return reject(p.ID, objectID, api.RejectReasonUnavailable)
}

func (st *State) interactDirectory(p *PlayerState, o *ObjectState, in ClientInteract) []Output {
	held := st.held(p.ID)
	if !claimMatches(in.Msg.HeldItem, held) {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}

	if held == nil {
		if in.Msg.Target == nil {
			return reject(p.ID, o.ID, api.RejectReasonMissingItem)
		}
		it := st.item(*in.Msg.Target)
		if it == nil || it.Kind != api.File || !isStockStatus(it.Status) ||
			it.Location.Kind != InDirectory || it.Location.ObjectID != o.ID {
			return reject(p.ID, o.ID, api.RejectReasonNotFound)
		}
		it.Location = Location{Kind: HeldBy, PlayerID: p.ID}
	} else {
		if held.Kind == api.Lighter {
			return st.interactDirectoryWithLighter(p, o, in.Now)
		}
		if held.Kind != api.File {
			return reject(p.ID, o.ID, api.RejectReasonMissingItem)
		}
		held.Location = Location{Kind: InDirectory, ObjectID: o.ID}
	}
	var put api.FileStatus
	if held != nil {
		put = held.Status
		uneditOnReturn(held)
	}
	out := []Output{
		Broadcast{Msg: st.objectUpsert(o)},
		Broadcast{Msg: st.playerUpdated(p)},
	}
	if held != nil {
		if done := st.completeTask(p.ID, held.ID, put, in.Now); len(done) > 0 {
			out = append(out, done...)
			if st.allTasksDone() {
				out = append(out, st.endPhase(in.Now)...)
			}
		}
	}
	return out
}

func uneditOnReturn(f *ItemState) {
	if f.Status == api.FileStatusEdited {
		f.Status = api.FileStatusUnedited
	}
}

func (st *State) interactDirectoryWithLighter(p *PlayerState, o *ObjectState, now time.Time) []Output {
	if !st.Team.BypassPermission {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}
	if st.Team.FireStarted {
		return reject(p.ID, o.ID, api.RejectReasonUnavailable)
	}
	return st.startFire(p, o, now)
}

func (st *State) interactWorkspace(p *PlayerState, o *ObjectState, in ClientInteract) []Output {
	if len(o.Users) > 0 {
		return reject(p.ID, o.ID, api.RejectReasonUnavailable)
	}
	held := st.held(p.ID)
	if !claimMatches(in.Msg.HeldItem, held) {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}
	if held != nil && (held.Kind != api.File || held.Status != api.FileStatusUnedited) {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}

	action := ObjectAction{ObjectID: o.ID, PlayerID: p.ID, NewID: in.NewID, Creates: api.FileStatusFileCreated, DueAt: in.Now.Add(WorkspaceActionDuration)}
	if held != nil {
		action.EditingID = held.ID
	}
	return st.startAction(p, o, action)
}

func (st *State) interactCanvas(p *PlayerState, o *ObjectState, in ClientInteract) []Output {
	if len(o.Users) > 0 {
		return reject(p.ID, o.ID, api.RejectReasonUnavailable)
	}
	held := st.held(p.ID)
	if held != nil || in.Msg.HeldItem != nil {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}
	return st.startAction(p, o, ObjectAction{ObjectID: o.ID, PlayerID: p.ID, NewID: in.NewID, Creates: api.FileStatusImageCreated, DueAt: in.Now.Add(CanvasActionDuration)})
}

func (st *State) startAction(p *PlayerState, o *ObjectState, a ObjectAction) []Output {
	st.Actions = append(st.Actions, a)
	o.Users = []string{p.ID}
	return []Output{Broadcast{Msg: st.objectUpsert(o)}}
}

func (st *State) interactLighterStand(p *PlayerState, o *ObjectState, in ClientInteract) []Output {
	held := st.held(p.ID)
	if !claimMatches(in.Msg.HeldItem, held) {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}
	switch {
	case held == nil:
		i := slices.IndexFunc(st.Items, func(it ItemState) bool {
			return it.Kind == api.Lighter && it.Location.Kind == OnObject && it.Location.ObjectID == o.ID
		})
		if i < 0 {
			return reject(p.ID, o.ID, api.RejectReasonNotFound)
		}
		st.Items[i].Location = Location{Kind: HeldBy, PlayerID: p.ID}
	case held.Kind == api.Lighter && held.Home == o.ID:
		held.Location = Location{Kind: OnObject, ObjectID: o.ID}
	default:
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}
	return []Output{
		Broadcast{Msg: st.objectUpsert(o)},
		Broadcast{Msg: st.playerUpdated(p)},
	}
}

func (st *State) finishActions(now time.Time) []Output {
	var out []Output
	var rest []ObjectAction
	for _, a := range st.Actions {
		if now.Before(a.DueAt) {
			rest = append(rest, a)
			continue
		}
		out = append(out, st.finishAction(a)...)
	}
	st.Actions = rest
	return out
}

func (st *State) finishAction(a ObjectAction) []Output {
	o := st.object(a.ObjectID)
	p := st.player(a.PlayerID)
	if o == nil || p == nil {
		return nil
	}
	var out []Output
	held := st.held(p.ID)
	switch {
	case a.EditingID == "" && held == nil:
		st.Items = append(st.Items, ItemState{
			ID:       a.NewID,
			Kind:     api.File,
			Status:   a.Creates,
			Location: Location{Kind: HeldBy, PlayerID: p.ID},
		})
		out = append(out, Broadcast{Msg: st.playerUpdated(p)})
	case a.EditingID != "" && held != nil && held.ID == a.EditingID && held.Status == api.FileStatusUnedited:
		held.Status = api.FileStatusEdited
		out = append(out, Broadcast{Msg: st.playerUpdated(p)})
	}
	o.Users = slices.DeleteFunc(o.Users, func(u string) bool { return u == p.ID })
	return append(out, Broadcast{Msg: st.objectUpsert(o)})
}

func (st *State) cancelActions() []Output {
	var out []Output
	for _, a := range st.Actions {
		if o := st.object(a.ObjectID); o != nil {
			o.Users = slices.DeleteFunc(o.Users, func(u string) bool { return u == a.PlayerID })
			out = append(out, Broadcast{Msg: st.objectUpsert(o)})
		}
	}
	st.Actions = nil
	return out
}

func (st *State) releasePlayer(p *PlayerState) []Output {
	var out []Output
	var rest []ObjectAction
	for _, a := range st.Actions {
		if a.PlayerID != p.ID {
			rest = append(rest, a)
			continue
		}
		if o := st.object(a.ObjectID); o != nil {
			o.Users = slices.DeleteFunc(o.Users, func(u string) bool { return u == p.ID })
			out = append(out, Broadcast{Msg: st.objectUpsert(o)})
		}
	}
	st.Actions = rest

	held := st.held(p.ID)
	switch {
	case held == nil:
	case held.Kind == api.File:
		held.Location = Location{Kind: InDirectory, ObjectID: directoryID}
		uneditOnReturn(held)
		if o := st.object(directoryID); o != nil {
			out = append(out, Broadcast{Msg: st.objectUpsert(o)})
		}
	case held.Kind == api.Lighter:
		held.Location = Location{Kind: OnObject, ObjectID: held.Home}
		if o := st.object(held.Home); o != nil {
			out = append(out, Broadcast{Msg: st.objectUpsert(o)})
		}
	}
	return out
}
