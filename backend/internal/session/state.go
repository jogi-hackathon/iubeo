package session

import (
	"slices"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// State はセッションの内部状態(サーバーの正)。セッションの goroutine だけが持ち、Step でだけ変える。
// クライアントへは Snapshot などで配る形に組み立てる(state-schema.md §3)
type State struct {
	ID        string
	Mode      api.SessionMode
	Status    api.SessionStatus
	CreatedAt time.Time
	StartedAt time.Time
	// Seq は確定状態を変えるメッセージごとに増やす
	Seq     int64
	Players []PlayerState
	Objects []ObjectState
	Items   []ItemState
	Team    api.Team
	// Actions は作業中のワークスペースのアクション
	Actions []WorkspaceAction

	// StartTimeout までに人間全員が接続しなければ解散する
	StartTimeout time.Duration
	// 人間が全員切断してから AbandonTimeout たっても誰も戻らなければ破棄する
	AbandonTimeout time.Duration
	// AllDisconnectedAt は人間が全員切断した時刻。誰かが接続していればゼロ
	AllDisconnectedAt time.Time
	// Ended は終わった(解散・破棄)。以降の入力は無視する
	Ended bool
}

// PlayerState はプレイヤーの内部状態
type PlayerState struct {
	ID         string
	Kind       api.PlayerKind
	Seat       int
	Connection api.ConnectionStatus
	Life       api.LifeStatus
	Transform  api.Transform
	// ConnID は今の接続。無ければ 0
	ConnID uint64
	// reported はクライアントから transform を受け取ったか(初回は seq によらず受け付ける)
	reported bool
	// moved は前回の transforms の配信から動いたか
	moved bool
}

// ObjectState はオブジェクトの内部状態。data は配るときに items から組み立てる
type ObjectState struct {
	ID           string
	Kind         api.ObjectKind
	Scope        api.ObjectScope
	Owner        string
	Position     api.Vec3
	Users        []string
	Availability api.ObjectAvailability
}

// LocationKind はアイテムの所在の種類
type LocationKind string

const (
	InDirectory LocationKind = "directory"
	HeldBy      LocationKind = "held_by"
	OnObject    LocationKind = "object"
)

// Location はアイテムの所在
type Location struct {
	Kind     LocationKind
	ObjectID string
	PlayerID string
}

// ItemState はアイテム(ファイル・ライター)の内部状態。所在に関係なくひとつの一覧で持つ
type ItemState struct {
	ID       string
	Kind     api.ItemKind
	Status   api.FileStatus // kind が file のときだけ
	Color    string         // 在庫から取り出したファイルだけ
	Location Location
}

// Timeouts はセッションの時間の決まり
type Timeouts struct {
	Start   time.Duration
	Abandon time.Duration
}

// NewMultiplayerState は自動マッチングでそろったプレイヤーの、開始前(waiting)の状態を作る。
// playerIDs の並びが席の順
func NewMultiplayerState(id string, playerIDs []string, createdAt time.Time, timeouts Timeouts) State {
	st := State{
		ID:             id,
		Mode:           api.SessionModeMultiplayer,
		Status:         api.SessionStatusWaiting,
		CreatedAt:      createdAt,
		StartTimeout:   timeouts.Start,
		AbandonTimeout: timeouts.Abandon,
	}
	st.Objects = append(st.Objects, ObjectState{
		ID:           directoryID,
		Kind:         api.Directory,
		Scope:        api.Shared,
		Position:     slices.Clone(directoryPosition),
		Users:        []string{},
		Availability: api.ObjectAvailabilityAvailable,
	})
	for _, f := range directoryStock {
		st.Items = append(st.Items, ItemState{
			ID:       f.id,
			Kind:     api.File,
			Status:   api.FileStatusUnedited,
			Color:    f.color,
			Location: Location{Kind: InDirectory, ObjectID: directoryID},
		})
	}
	for i, pid := range playerIDs {
		seat := i + 1
		st.Players = append(st.Players, PlayerState{
			ID:         pid,
			Kind:       api.Human,
			Seat:       seat,
			Connection: api.Connecting,
			Life:       api.Alive,
			Transform:  api.Transform{Position: slices.Clone(spawnPositions[seat])},
		})
		st.Objects = append(st.Objects, ObjectState{
			ID:           workspaceID(seat),
			Kind:         api.Workspace,
			Scope:        api.Personal,
			Owner:        pid,
			Position:     slices.Clone(workspacePositions[seat]),
			Users:        []string{},
			Availability: api.ObjectAvailabilityAvailable,
		})
	}
	return st
}

// clone は State の深いコピーを返す。Step は受け取った State を書き換えずに、コピーを変えて返す
func (st State) clone() State {
	c := st
	c.Players = slices.Clone(st.Players)
	for i := range c.Players {
		c.Players[i].Transform.Position = slices.Clone(st.Players[i].Transform.Position)
	}
	c.Objects = slices.Clone(st.Objects)
	for i := range c.Objects {
		c.Objects[i].Position = slices.Clone(st.Objects[i].Position)
		c.Objects[i].Users = slices.Clone(st.Objects[i].Users)
	}
	c.Items = slices.Clone(st.Items)
	c.Actions = slices.Clone(st.Actions)
	return c
}

func (st *State) player(id string) *PlayerState {
	i := slices.IndexFunc(st.Players, func(p PlayerState) bool { return p.ID == id })
	if i < 0 {
		return nil
	}
	return &st.Players[i]
}

// HasPlayer はプレイヤーが参加者かどうかを返す
func (st State) HasPlayer(id string) bool {
	return st.player(id) != nil
}

// ---------- 配る形への組み立て(state-schema.md §3.2) ----------

func (st State) heldItem(playerID string) *api.Item {
	for _, it := range st.Items {
		if it.Location.Kind != HeldBy || it.Location.PlayerID != playerID {
			continue
		}
		item := api.Item{Id: it.ID, Kind: it.Kind, Data: nil}
		if it.Kind == api.File {
			data := api.FileItemData{Status: it.Status}
			if it.Color != "" {
				data.Color = &it.Color
			}
			item.Data = data
		}
		return &item
	}
	return nil
}

func (st State) playerStatus(p PlayerState) api.PlayerStatus {
	return api.PlayerStatus{
		PlayerId:   p.ID,
		Kind:       p.Kind,
		Seat:       p.Seat,
		Connection: p.Connection,
		Life:       p.Life,
		HeldItem:   st.heldItem(p.ID),
	}
}

func isStockStatus(s api.FileStatus) bool {
	return s == api.FileStatusUnedited || s == api.FileStatusEdited
}

func (st State) directoryData(objectID string) api.DirectoryData {
	data := api.DirectoryData{Stock: []api.StockFile{}}
	for _, it := range st.Items {
		if it.Kind != api.File || it.Location.Kind != InDirectory || it.Location.ObjectID != objectID {
			continue
		}
		if isStockStatus(it.Status) {
			data.Stock = append(data.Stock, api.StockFile{Id: it.ID, Color: it.Color, Status: api.StockFileStatus(it.Status)})
		} else {
			data.Outputs++
		}
	}
	return data
}

func (st State) gameObject(o ObjectState) api.GameObject {
	g := api.GameObject{
		Id:           o.ID,
		Kind:         o.Kind,
		Scope:        o.Scope,
		Position:     slices.Clone(o.Position),
		Users:        slices.Clone(o.Users),
		Availability: o.Availability,
		Data:         nil,
	}
	if o.Owner != "" {
		g.Owner = &o.Owner
	}
	if o.Kind == api.Directory {
		g.Data = st.directoryData(o.ID)
	}
	return g
}

// Snapshot はセッション全体を配る形に組み立てる(state-schema.md §4)
func (st State) Snapshot(now time.Time) api.SessionSnapshot {
	snap := api.SessionSnapshot{
		SchemaVersion: api.N2,
		SessionId:     st.ID,
		Mode:          st.Mode,
		Status:        st.Status,
		CreatedAt:     st.CreatedAt,
		ServerTime:    now,
		Seq:           st.Seq,
		Players:       make([]api.Player, 0, len(st.Players)),
		Objects:       make([]api.GameObject, 0, len(st.Objects)),
		Game:          api.Game{Phase: nil, Team: st.Team, Result: nil},
	}
	for _, p := range st.Players {
		ps := st.playerStatus(p)
		snap.Players = append(snap.Players, api.Player{
			PlayerId:   ps.PlayerId,
			Kind:       ps.Kind,
			Seat:       ps.Seat,
			Connection: ps.Connection,
			Life:       ps.Life,
			HeldItem:   ps.HeldItem,
			Transform:  cloneTransform(p.Transform),
		})
	}
	for _, o := range st.Objects {
		snap.Objects = append(snap.Objects, st.gameObject(o))
	}
	return snap
}

func cloneTransform(t api.Transform) api.Transform {
	t.Position = slices.Clone(t.Position)
	return t
}
