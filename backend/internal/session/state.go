package session

import (
	"math/rand/v2"
	"slices"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

type State struct {
	ID          string
	Mode        api.SessionMode
	Status      api.SessionStatus
	CreatedAt   time.Time
	StartedAt   time.Time
	Seq         int64
	Players     []PlayerState
	Objects     []ObjectState
	Items       []ItemState
	Team        api.Team
	Actions     []ObjectAction
	Phases      PhaseRules
	Phase       PhaseState
	Result      api.Result
	BypassAt    time.Time
	FireAt      time.Time
	rng         rand.PCG
	CPUAgents   map[string]CPUAgent
	CPUPersonas map[string]CPUPersona
	CPULastAt   time.Time
	CPUItemSeq  int

	StartTimeout      time.Duration
	AbandonTimeout    time.Duration
	AllDisconnectedAt time.Time
	Ended             bool
}

type PlayerState struct {
	ID         string
	Kind       api.PlayerKind
	Seat       int
	Connection api.ConnectionStatus
	Life       api.LifeStatus
	Transform  api.Transform
	ConnID     uint64
	reported   bool
	moved      bool
}

type ObjectState struct {
	ID           string
	Kind         api.ObjectKind
	Scope        api.ObjectScope
	Owner        string
	Users        []string
	Availability api.ObjectAvailability
}

type LocationKind string

const (
	InDirectory LocationKind = "directory"
	HeldBy      LocationKind = "held_by"
	OnObject    LocationKind = "object"
)

type Location struct {
	Kind     LocationKind
	ObjectID string
	PlayerID string
}

type ItemState struct {
	ID       string
	Kind     api.ItemKind
	Status   api.FileStatus
	Color    string
	Location Location
	Home     string
}

type Timeouts struct {
	Start   time.Duration
	Abandon time.Duration
}

func NewMultiplayerState(id string, humanIDs []string, cpuIDs []string, createdAt time.Time, timeouts Timeouts, phases PhaseRules, seed uint64) State {
	st := State{
		ID:             id,
		Mode:           api.SessionModeMultiplayer,
		Status:         api.SessionStatusWaiting,
		CreatedAt:      createdAt,
		StartTimeout:   timeouts.Start,
		AbandonTimeout: timeouts.Abandon,
		Phases:         phases,
		rng:            *rand.NewPCG(seed, seed),
		CPUAgents:      map[string]CPUAgent{},
		CPUPersonas:    map[string]CPUPersona{},
	}
	st.Objects = append(st.Objects, ObjectState{
		ID:           directoryID,
		Kind:         api.Directory,
		Scope:        api.Shared,
		Users:        []string{},
		Availability: api.ObjectAvailabilityAvailable,
	})
	ids := append(slices.Clone(humanIDs), cpuIDs...)
	for i, pid := range ids {
		seat := i + 1
		kind, connection := api.Human, api.Connecting
		if i >= len(humanIDs) {
			kind, connection = api.Cpu, api.Connected
		}
		st.Players = append(st.Players, PlayerState{
			ID:         pid,
			Kind:       kind,
			Seat:       seat,
			Connection: connection,
			Life:       api.Alive,
		})
		st.Objects = append(st.Objects, ObjectState{
			ID:           workspaceID(seat),
			Kind:         api.Workspace,
			Scope:        api.Personal,
			Owner:        pid,
			Users:        []string{},
			Availability: api.ObjectAvailabilityAvailable,
		})
		st.Objects = append(st.Objects, ObjectState{
			ID:           canvasID(seat),
			Kind:         api.Canvas,
			Scope:        api.Personal,
			Owner:        pid,
			Users:        []string{},
			Availability: api.ObjectAvailabilityAvailable,
		})
		st.Objects = append(st.Objects, ObjectState{
			ID:           pcID(seat),
			Kind:         api.Pc,
			Scope:        api.Personal,
			Owner:        pid,
			Users:        []string{},
			Availability: api.ObjectAvailabilityAvailable,
		})
		st.Objects = append(st.Objects, ObjectState{
			ID:           lighterStandID(seat),
			Kind:         api.LighterStand,
			Scope:        api.Personal,
			Owner:        pid,
			Users:        []string{},
			Availability: api.ObjectAvailabilityUnavailable,
		})
	}
	st.Items = st.initialItems()
	r := rand.New(&st.rng)
	order := r.Perm(len(cpuPersonas))
	for i, pid := range cpuIDs {
		st.CPUPersonas[pid] = cpuPersonas[order[i%len(order)]]
	}
	return st
}

func (st *State) initialItems() []ItemState {
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

func (st *State) clone() State {
	c := *st
	c.Players = slices.Clone(st.Players)
	for i := range c.Players {
		c.Players[i].Transform.Position = slices.Clone(st.Players[i].Transform.Position)
	}
	c.Objects = slices.Clone(st.Objects)
	for i := range c.Objects {
		c.Objects[i].Users = slices.Clone(st.Objects[i].Users)
	}
	c.Items = slices.Clone(st.Items)
	c.Actions = slices.Clone(st.Actions)
	c.Phase.Tasks = slices.Clone(st.Phase.Tasks)
	if st.CPUAgents != nil {
		c.CPUAgents = make(map[string]CPUAgent, len(st.CPUAgents))
		for k, v := range st.CPUAgents {
			c.CPUAgents[k] = v
		}
	}
	if st.CPUPersonas != nil {
		c.CPUPersonas = make(map[string]CPUPersona, len(st.CPUPersonas))
		for k, v := range st.CPUPersonas {
			c.CPUPersonas[k] = v
		}
	}
	return c
}

func (st *State) player(id string) *PlayerState {
	i := slices.IndexFunc(st.Players, func(p PlayerState) bool { return p.ID == id })
	if i < 0 {
		return nil
	}
	return &st.Players[i]
}

func (st *State) HasPlayer(id string) bool {
	return st.player(id) != nil
}

func (st *State) heldItem(playerID string) *api.Item {
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

func (st *State) playerStatus(p PlayerState) api.PlayerStatus {
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

func (st *State) directoryData(objectID string) api.DirectoryData {
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

func (st *State) gameObject(o ObjectState) api.GameObject {
	g := api.GameObject{
		Id:           o.ID,
		Kind:         o.Kind,
		Scope:        o.Scope,
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

func (st *State) Snapshot(now time.Time) api.SessionSnapshot {
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
			Transform:  p.apiTransform(),
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

func (p PlayerState) apiTransform() *api.Transform {
	if !p.reported {
		return nil
	}
	t := cloneTransform(p.Transform)
	return &t
}

func cloneTransform(t api.Transform) api.Transform {
	t.Position = slices.Clone(t.Position)
	return t
}
