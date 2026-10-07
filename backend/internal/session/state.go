package session

import (
	"math/rand/v2"
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
	// Phases はフェーズの決まり、Phase は今(または最後)のフェーズ
	Phases PhaseRules
	Phase  PhaseState
	// Result は決着。決着前は Outcome が空
	Result api.Result
	// BypassAt は最後のフェーズを生き残って bypassPermission を立てた時刻、FireAt は火をつけた時刻。まだならゼロ
	BypassAt time.Time
	FireAt   time.Time
	// rng はタスクの分配に使う乱数。Step を純粋に保つため、状態に持って一緒に進める
	rng rand.PCG

	// StartTimeout までに人間全員が接続しなければ解散する
	StartTimeout time.Duration
	// 人間が全員切断してから AbandonTimeout たっても誰も戻らなければ破棄する
	AbandonTimeout time.Duration
	// AllDisconnectedAt は人間が全員切断した時刻。誰かが接続していればゼロ
	AllDisconnectedAt time.Time
	// Ended は終わった(決着・解散・破棄)。以降の入力は無視する
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
	// Home はライターの置き場(lighter_stand)の id。切断・脱落したらここに戻す
	Home string
}

// Timeouts はセッションの時間の決まり
type Timeouts struct {
	Start   time.Duration
	Abandon time.Duration
}

// NewMultiplayerState は自動マッチングでそろったプレイヤーの、開始前(waiting)の状態を作る。
// playerIDs の並びが席の順。seed はタスクの分配に使う乱数の種
func NewMultiplayerState(id string, playerIDs []string, createdAt time.Time, timeouts Timeouts, phases PhaseRules, seed uint64) State {
	st := State{
		ID:             id,
		Mode:           api.SessionModeMultiplayer,
		Status:         api.SessionStatusWaiting,
		CreatedAt:      createdAt,
		StartTimeout:   timeouts.Start,
		AbandonTimeout: timeouts.Abandon,
		Phases:         phases,
		rng:            *rand.NewPCG(seed, seed),
	}
	st.Objects = append(st.Objects, ObjectState{
		ID:           directoryID,
		Kind:         api.Directory,
		Scope:        api.Shared,
		Position:     slices.Clone(directoryPosition),
		Users:        []string{},
		Availability: api.ObjectAvailabilityAvailable,
	})
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
		// ライターの置き場。bypassPermission が立つまでは使えない
		st.Objects = append(st.Objects, ObjectState{
			ID:           lighterStandID(seat),
			Kind:         api.LighterStand,
			Scope:        api.Personal,
			Owner:        pid,
			Position:     lighterStandPosition(seat),
			Users:        []string{},
			Availability: api.ObjectAvailabilityUnavailable,
		})
	}
	st.Items = st.initialItems()
	return st
}

// initialItems はアイテムの初期状態(ディレクトリの初期在庫と、席ごとの置き場のライター)を返す
func (st State) initialItems() []ItemState {
	items := make([]ItemState, 0, len(directoryStock)+len(st.Players))
	for _, f := range directoryStock {
		items = append(items, ItemState{
			ID:       f.id,
			Kind:     api.File,
			Status:   api.FileStatusUnedited,
			Color:    f.color,
			Location: Location{Kind: InDirectory, ObjectID: directoryID},
		})
	}
	for _, p := range st.Players {
		stand := lighterStandID(p.Seat)
		items = append(items, ItemState{
			ID:       lighterID(p.Seat),
			Kind:     api.Lighter,
			Location: Location{Kind: OnObject, ObjectID: stand},
			Home:     stand,
		})
	}
	return items
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
	c.Phase.Tasks = slices.Clone(st.Phase.Tasks)
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
	switch o.Kind {
	case api.Directory:
		g.Data = st.directoryData(o.ID)
	case api.LighterStand:
		g.Data = api.LighterStandData{HasLighter: slices.ContainsFunc(st.Items, func(it ItemState) bool {
			return it.Kind == api.Lighter && it.Location.Kind == OnObject && it.Location.ObjectID == o.ID
		})}
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
	if st.Phase.Number > 0 {
		ph := st.apiPhase()
		snap.Game.Phase = &ph
	}
	if st.Result.Outcome != "" {
		result := st.Result
		snap.Game.Result = &result
	}
	return snap
}

func cloneTransform(t api.Transform) api.Transform {
	t.Position = slices.Clone(t.Position)
	return t
}
