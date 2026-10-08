package session

import (
	"slices"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// WorkspaceActionDuration はワークスペースのアクション(編集・新規作成)にかかる時間。
// フロントの WORKSPACE_ACTION_MS と同じ。結果はこの後に反映する(state-schema.md §5.4)
const WorkspaceActionDuration = 2 * time.Second

// WorkspaceAction は作業中のワークスペースのアクション。DueAt を過ぎた Tick で結果を適用する
type WorkspaceAction struct {
	ObjectID string
	PlayerID string
	// EditingID は編集するファイルの id。空なら新規作成
	EditingID string
	// NewID は新規作成で作るファイルの id(受け付けたときに採番しておく)
	NewID string
	DueAt time.Time
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

// held はプレイヤーの実際の手持ち。無ければ nil
func (st *State) held(playerID string) *ItemState {
	i := slices.IndexFunc(st.Items, func(it ItemState) bool {
		return it.Location.Kind == HeldBy && it.Location.PlayerID == playerID
	})
	if i < 0 {
		return nil
	}
	return &st.Items[i]
}

// claimMatches は要求の手持ちの主張が、実際の手持ちと合っているか
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

// interact はオブジェクトの操作の要求を検証し、通れば結果を全員に配る。負けた・通らない要求は本人にだけ拒否を返す。
// 手持ちは要求の主張ではなく、サーバーが持つ実際の手持ちで判定する(state-schema.md §5.3)
func (st *State) interact(in ClientInteract) []Output {
	p := st.player(in.PlayerID)
	if p == nil {
		return nil
	}
	objectID := in.Msg.ObjectId
	// 開始前・脱落後は操作できない
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
	}
	return reject(p.ID, objectID, api.RejectReasonUnavailable)
}

// interactDirectory: 手ぶらなら target のファイルを在庫から取り出して持つ(先着)。
// ファイルを持っていれば入れる(在庫のファイルは在庫に戻り、作ったファイルは成果物になる)。
// 入れたファイルで担当のタスクが達成になれば task.completed も送る(生存者全員が完了したら、フェーズを終える)
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
		if held.Kind != api.File {
			return reject(p.ID, o.ID, api.RejectReasonMissingItem)
		}
		held.Location = Location{Kind: InDirectory, ObjectID: o.ID}
	}
	out := []Output{
		Broadcast{Msg: st.objectUpsert(o)},
		Broadcast{Msg: st.playerUpdated(p)},
	}
	if held != nil {
		if done := st.completeTask(p.ID, held, in.Now); len(done) > 0 {
			out = append(out, done...)
			// 生存者全員が完了したら、締切前でもフェーズを終える
			if st.allTasksDone() {
				out = append(out, st.endPhase(in.Now)...)
			}
		}
	}
	return out
}

// interactWorkspace: 編集前のファイルを持っていれば編集、手ぶらなら新規作成を始める。
// 受け付けたら users に入れ、結果は WorkspaceActionDuration の後の Tick で適用する
func (st *State) interactWorkspace(p *PlayerState, o *ObjectState, in ClientInteract) []Output {
	if len(o.Users) > 0 {
		return reject(p.ID, o.ID, api.RejectReasonUnavailable)
	}
	held := st.held(p.ID)
	if !claimMatches(in.Msg.HeldItem, held) {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}
	// 編集できるのは在庫から取り出した編集前のファイルだけ(作ったファイルは編集しない)
	if held != nil && (held.Kind != api.File || held.Status != api.FileStatusUnedited) {
		return reject(p.ID, o.ID, api.RejectReasonMissingItem)
	}

	action := WorkspaceAction{ObjectID: o.ID, PlayerID: p.ID, NewID: in.NewID, DueAt: in.Now.Add(WorkspaceActionDuration)}
	if held != nil {
		action.EditingID = held.ID
	}
	st.Actions = append(st.Actions, action)
	o.Users = []string{p.ID}
	return []Output{Broadcast{Msg: st.objectUpsert(o)}}
}

// finishWorkspaceActions は期限が来たアクションの結果を適用する。
// その時点で手持ちが条件を外れていれば結果は適用せず、users から外すだけ
func (st *State) finishWorkspaceActions(now time.Time) []Output {
	var out []Output
	var rest []WorkspaceAction
	for _, a := range st.Actions {
		if now.Before(a.DueAt) {
			rest = append(rest, a)
			continue
		}
		out = append(out, st.finishWorkspaceAction(a)...)
	}
	st.Actions = rest
	return out
}

func (st *State) finishWorkspaceAction(a WorkspaceAction) []Output {
	o := st.object(a.ObjectID)
	p := st.player(a.PlayerID)
	// 作業中にワークスペースが消えたら、結果は適用しない
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
			Status:   api.FileStatusFileCreated,
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

// cancelActions は作業中のアクションをすべて取りやめる(フェーズの終わり)
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

// releasePlayer は切断・脱落したプレイヤーの作業を取りやめ、手持ちのファイルをディレクトリに戻す
// (在庫のファイルは在庫に、作ったファイルは成果物に。state-schema.md §5.5)。
// 本人が入れたのではないので、タスクの達成には数えない
func (st *State) releasePlayer(p *PlayerState) []Output {
	var out []Output
	var rest []WorkspaceAction
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

	if held := st.held(p.ID); held != nil && held.Kind == api.File {
		held.Location = Location{Kind: InDirectory, ObjectID: directoryID}
		if o := st.object(directoryID); o != nil {
			out = append(out, Broadcast{Msg: st.objectUpsert(o)})
		}
	}
	return out
}
