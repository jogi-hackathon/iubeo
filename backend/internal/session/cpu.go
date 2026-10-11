package session

import (
	"math"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

const (
	cpuWalkSpeed    = 2.4
	cpuReachEpsilon = 0.2
)

type CpuPersona struct {
	Name        string
	WalkSpeed   float64
	JitterMax   time.Duration
	Reliability float64
	ThinkPause  time.Duration
}

var cpuPersonas = []CpuPersona{
	{Name: "せっかち", WalkSpeed: 3.1, JitterMax: 300 * time.Millisecond, Reliability: 0.85, ThinkPause: 200 * time.Millisecond},
	{Name: "丁寧", WalkSpeed: 2.0, JitterMax: 900 * time.Millisecond, Reliability: 0.97, ThinkPause: 800 * time.Millisecond},
	{Name: "マイペース", WalkSpeed: 2.2, JitterMax: 1200 * time.Millisecond, Reliability: 0.9, ThinkPause: 1200 * time.Millisecond},
	{Name: "不器用", WalkSpeed: 2.4, JitterMax: 600 * time.Millisecond, Reliability: 0.7, ThinkPause: 500 * time.Millisecond},
	{Name: "仕事人", WalkSpeed: 2.8, JitterMax: 400 * time.Millisecond, Reliability: 0.95, ThinkPause: 300 * time.Millisecond},
}

type cpuStage int

const (
	cpuStageIdle cpuStage = iota
	cpuStageFetch
	cpuStageToStation
	cpuStageWorking
	cpuStageDeliver
	cpuStageWait
	cpuStageDone
)

type CpuAgent struct {
	Stage       cpuStage
	TaskID      string
	Target      [3]float64
	Until       time.Time
	Resume      cpuStage
	Reliability float64
	WalkSpeed   float64
	JitterMax   time.Duration
	ThinkPause  time.Duration
	Skip        bool
}

func (st *State) resetCpuAgents() {
	st.CpuAgents = map[string]CpuAgent{}
	st.CpuLastAt = time.Time{}
	for i := range st.Players {
		p := &st.Players[i]
		if p.Kind != api.Cpu || p.Life != api.Alive {
			continue
		}
		pos := cpuWaypoint(p.Seat, cpuLocalSpawn)
		p.Transform.Position = []float64{pos[0], pos[1], pos[2]}
		p.Transform.Yaw = cpuSeatYaw(p.Seat)
		st.cpuMarkMoved(p)
		persona, ok := st.CpuPersonas[p.ID]
		if !ok {
			persona = cpuPersonas[0]
		}
		st.CpuAgents[p.ID] = CpuAgent{
			Stage:       cpuStageIdle,
			Reliability: persona.Reliability,
			WalkSpeed:   persona.WalkSpeed,
			JitterMax:   persona.JitterMax,
			ThinkPause:  persona.ThinkPause,
		}
	}
}

func (st *State) cpuMarkMoved(p *PlayerState) {
	p.reported = true
	p.moved = true
	p.Transform.Seq++
}

func (st *State) cpuNewID() string {
	st.CpuItemSeq++
	return "cpu-" + strconv.Itoa(st.CpuItemSeq)
}

func (st *State) cpuStep(now time.Time) []Output {
	if st.Status != api.SessionStatusPlaying || st.Phase.Status != api.PhaseStatusActive {
		return nil
	}
	dt := 0.0
	if !st.CpuLastAt.IsZero() {
		dt = now.Sub(st.CpuLastAt).Seconds()
	}
	if dt < 0 || dt > 1 {
		dt = 0.05
	}
	st.CpuLastAt = now

	var out []Output
	for i := range st.Players {
		p := &st.Players[i]
		if p.Kind != api.Cpu || p.Life != api.Alive {
			continue
		}
		a := st.CpuAgents[p.ID]
		out = append(out, st.cpuAdvance(p, &a, dt, now)...)
		st.CpuAgents[p.ID] = a
	}
	return out
}

func (st *State) cpuAdvance(p *PlayerState, a *CpuAgent, dt float64, now time.Time) []Output {
	switch a.Stage {
	case cpuStageIdle:
		return st.cpuStartTask(p, a, now)
	case cpuStageFetch:
		if st.cpuMove(p, a, dt) {
			return st.cpuFetch(p, a, now)
		}
	case cpuStageToStation:
		if st.cpuMove(p, a, dt) {
			return st.cpuWork(p, a, now)
		}
	case cpuStageWorking:
		if !now.Before(a.Until) {
			st.cpuAfterWork(p, a)
		}
	case cpuStageDeliver:
		if st.cpuMove(p, a, dt) {
			return st.cpuDeliver(p, a, now)
		}
	case cpuStageWait:
		if !now.Before(a.Until) {
			a.Stage = a.Resume
		}
	}
	return nil
}

func (st *State) cpuMove(p *PlayerState, a *CpuAgent, dt float64) bool {
	pos := p.Transform.Position
	if len(pos) != 3 {
		pos = []float64{a.Target[0], a.Target[1], a.Target[2]}
		p.Transform.Position = pos
		return true
	}
	dx := a.Target[0] - pos[0]
	dy := a.Target[1] - pos[1]
	dz := a.Target[2] - pos[2]
	dist := math.Sqrt(dx*dx + dy*dy + dz*dz)
	if dist <= cpuReachEpsilon {
		return true
	}
	step := a.WalkSpeed * dt
	if step <= 0 {
		step = cpuWalkSpeed * dt
	}
	if step >= dist {
		p.Transform.Position = []float64{a.Target[0], a.Target[1], a.Target[2]}
		st.cpuMarkMoved(p)
		return true
	}
	p.Transform.Position = []float64{
		pos[0] + dx/dist*step,
		pos[1] + dy/dist*step,
		pos[2] + dz/dist*step,
	}
	p.Transform.Yaw = math.Atan2(-dx, -dz)
	st.cpuMarkMoved(p)
	return false
}

func (st *State) cpuStartTask(p *PlayerState, a *CpuAgent, now time.Time) []Output {
	t := st.cpuPendingTask(p.ID)
	if t == nil {
		a.Stage = cpuStageDone
		return nil
	}
	a.TaskID = t.ID
	r := rand.New(&st.rng)
	a.Skip = r.Float64() > a.Reliability
	var target [3]float64
	next := cpuStageToStation
	if t.Type == api.ReadEdit {
		next = cpuStageFetch
		target = cpuWaypoint(p.Seat, cpuLocalDirectory)
	} else {
		target = cpuWaypoint(p.Seat, cpuStation(t.Type))
	}
	a.Target = target
	if a.ThinkPause > 0 && rand.New(&st.rng).Float64() > 0.3 {
		a.Stage = cpuStageWait
		a.Resume = next
		a.Until = now.Add(time.Duration(rand.New(&st.rng).Int64N(int64(a.ThinkPause)) + 1))
		return nil
	}
	a.Stage = next
	return nil
}

func (st *State) cpuFetch(p *PlayerState, a *CpuAgent, now time.Time) []Output {
	t := st.cpuTask(p.ID, a.TaskID)
	dir := st.object(directoryID)
	if t == nil || dir == nil {
		a.Stage = cpuStageDone
		return nil
	}
	target := t.TargetFileID
	out := st.interactDirectory(p, dir, ClientInteract{
		PlayerID: p.ID,
		Now:      now,
		NewID:    st.cpuNewID(),
		Msg: api.InteractMessage{
			Type:     api.Interact,
			ObjectId: directoryID,
			Target:   &target,
			HeldItem: heldRef(nil),
		},
	})
	if st.held(p.ID) == nil {
		a.Stage = cpuStageWait
		a.Resume = cpuStageFetch
		a.Until = now.Add(500 * time.Millisecond)
		return out
	}
	a.Stage = cpuStageToStation
	a.Target = cpuWaypoint(p.Seat, cpuStation(t.Type))
	return out
}

func (st *State) cpuWork(p *PlayerState, a *CpuAgent, now time.Time) []Output {
	t := st.cpuTask(p.ID, a.TaskID)
	if t == nil {
		a.Stage = cpuStageDone
		return nil
	}
	before := len(st.Actions)
	var out []Output
	switch t.Type {
	case api.ReadEdit:
		held := st.held(p.ID)
		if held == nil {
			a.Stage = cpuStageIdle
			return nil
		}
		o := st.object(workspaceID(p.Seat))
		out = st.interactWorkspace(p, o, ClientInteract{
			PlayerID: p.ID, Now: now, NewID: st.cpuNewID(),
			Msg: api.InteractMessage{Type: api.Interact, ObjectId: o.ID, HeldItem: heldRef(held)},
		})
	case api.Write:
		o := st.object(workspaceID(p.Seat))
		out = st.interactWorkspace(p, o, ClientInteract{
			PlayerID: p.ID, Now: now, NewID: st.cpuNewID(),
			Msg: api.InteractMessage{Type: api.Interact, ObjectId: o.ID},
		})
	case api.WebSearch:
		o := st.object(pcID(p.Seat))
		out = st.interactPC(p, o, ClientInteract{
			PlayerID: p.ID, Now: now, NewID: st.cpuNewID(),
			Msg: api.InteractMessage{Type: api.Interact, ObjectId: o.ID},
		})
	case api.ImageGeneration:
		o := st.object(canvasID(p.Seat))
		out = st.interactCanvas(p, o, ClientInteract{
			PlayerID: p.ID, Now: now, NewID: st.cpuNewID(),
			Msg: api.InteractMessage{Type: api.Interact, ObjectId: o.ID},
		})
	}
	if len(st.Actions) == before {
		a.Stage = cpuStageWait
		a.Resume = cpuStageToStation
		a.Until = now.Add(500 * time.Millisecond)
		return out
	}
	jitter := time.Duration(0)
	if a.JitterMax > 0 {
		jitter = time.Duration(rand.New(&st.rng).Int64N(int64(a.JitterMax)) + 1)
	}
	st.Actions[len(st.Actions)-1].DueAt = st.Actions[len(st.Actions)-1].DueAt.Add(jitter)
	a.Stage = cpuStageWorking
	a.Until = st.Actions[len(st.Actions)-1].DueAt
	return out
}

func (st *State) cpuAfterWork(p *PlayerState, a *CpuAgent) {
	if a.Skip {
		a.Stage = cpuStageDone
		return
	}
	a.Stage = cpuStageDeliver
	a.Target = cpuWaypoint(p.Seat, cpuLocalDirectory)
}

func (st *State) cpuDeliver(p *PlayerState, a *CpuAgent, now time.Time) []Output {
	held := st.held(p.ID)
	dir := st.object(directoryID)
	if held == nil || dir == nil {
		a.Stage = cpuStageIdle
		return nil
	}
	out := st.interactDirectory(p, dir, ClientInteract{
		PlayerID: p.ID, Now: now, NewID: st.cpuNewID(),
		Msg: api.InteractMessage{Type: api.Interact, ObjectId: directoryID, HeldItem: heldRef(held)},
	})
	a.Stage = cpuStageIdle
	return out
}

func (st *State) cpuPendingTask(playerID string) *TaskState {
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.Assignee == playerID && t.CompletedAt.IsZero() {
			return t
		}
	}
	return nil
}

func (st *State) cpuTask(playerID, taskID string) *TaskState {
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.ID == taskID && t.Assignee == playerID && t.CompletedAt.IsZero() {
			return t
		}
	}
	return nil
}

func heldRef(it *ItemState) *api.HeldItemRef {
	if it == nil {
		return nil
	}
	return &api.HeldItemRef{Id: it.ID, Kind: it.Kind}
}
