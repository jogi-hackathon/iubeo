package session

import (
	"math"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

const (
	cpuAccel        = 5.0
	cpuDecel        = 4.0
	cpuMinSpeed     = 0.35
	cpuReachEpsilon = 0.03
	cpuFaceEpsilon  = 0.12
	cpuTurnInPlace  = 1.3
	cpuPitchSpeed   = 2.5
	cpuTaskEstimate = 9 * time.Second
	cpuSafetyMargin = 15 * time.Second
	cpuCalm         = 0.3
	cpuGroundY      = 0.05
	cpuGravity      = 9.8
)

type CPUPersona struct {
	Name       string
	WalkSpeed  float64
	TurnSpeed  float64
	JitterMax  time.Duration
	ThinkPause time.Duration
	Survival   float64
	Slip       float64
	Hurry      float64
	Dawdle     float64
	Playful    float64
}

var cpuPersonas = []CPUPersona{
	{Name: "せっかち", WalkSpeed: 3.2, TurnSpeed: 9, JitterMax: 300 * time.Millisecond, ThinkPause: 250 * time.Millisecond, Survival: 0.95, Slip: 0.25, Hurry: 0.3, Dawdle: 0.25, Playful: 0.6},
	{Name: "丁寧", WalkSpeed: 2.1, TurnSpeed: 5, JitterMax: 900 * time.Millisecond, ThinkPause: 900 * time.Millisecond, Survival: 0.99, Slip: 0.03, Hurry: 0.35, Dawdle: 0.3, Playful: 0.2},
	{Name: "マイペース", WalkSpeed: 2.2, TurnSpeed: 4.5, JitterMax: 1200 * time.Millisecond, ThinkPause: 1400 * time.Millisecond, Survival: 0.95, Slip: 0.1, Hurry: 0.1, Dawdle: 0.85, Playful: 0.8},
	{Name: "不器用", WalkSpeed: 2.5, TurnSpeed: 6, JitterMax: 600 * time.Millisecond, ThinkPause: 600 * time.Millisecond, Survival: 0.92, Slip: 0.35, Hurry: 0.35, Dawdle: 0.5, Playful: 0.6},
	{Name: "仕事人", WalkSpeed: 2.9, TurnSpeed: 7.5, JitterMax: 400 * time.Millisecond, ThinkPause: 350 * time.Millisecond, Survival: 0.99, Slip: 0.05, Hurry: 0.3, Dawdle: 0.15, Playful: 0.15},
}

type cpuStage int

const (
	cpuStageIdle cpuStage = iota
	cpuStageWalk
	cpuStageFace
	cpuStageWorking
	cpuStageWait
	cpuStageRest
)

type cpuGoal int

const (
	cpuGoalNone cpuGoal = iota
	cpuGoalFetch
	cpuGoalWork
	cpuGoalDeliver
	cpuGoalSlip
	cpuGoalRest
	cpuGoalWander
)

type CPUAgent struct {
	Persona CPUPersona
	Stage   cpuStage
	Goal    cpuGoal
	TaskID  string
	Spot    cpuSpot
	Speed   float64
	Face    float64
	HasFace bool
	Pitch   float64
	Until   time.Time
	Resume  cpuStage
	Doomed  bool
	Slipped bool
	Looked  bool
	Dawdled string
	Dawdle  time.Time
	VelY    float64
	Air     bool
	Hops    int
	HopAt   time.Time
	Play    time.Time
}

func (st *State) resetCPUAgents(now time.Time) {
	if st.CPUAgents == nil {
		st.CPUAgents = map[string]CPUAgent{}
	}
	st.CPULastAt = time.Time{}
	r := rand.New(&st.rng)
	for i := range st.Players {
		p := &st.Players[i]
		if p.Kind != api.Cpu || p.Life != api.Alive {
			continue
		}
		if len(p.Transform.Position) != 3 {
			pos := cpuWaypoint(p.Seat, cpuLocalSpawn)
			p.Transform.Position = []float64{pos[0], pos[1], pos[2]}
			p.Transform.Yaw = cpuSeatYaw(p.Seat)
			st.cpuMarkMoved(p)
		}
		persona, ok := st.CPUPersonas[p.ID]
		if !ok {
			persona = cpuPersonas[0]
		}
		a := CPUAgent{
			Persona: persona,
			Stage:   cpuStageWait,
			Resume:  cpuStageIdle,
			Until:   now.Add(time.Duration(r.Int64N(int64(persona.ThinkPause)+int64(400*time.Millisecond))) + 200*time.Millisecond),
			Doomed:  r.Float64() > persona.Survival,
			Play:    now.Add(time.Duration(r.Int64N(int64(8 * time.Second)))),
		}
		if t := st.cpuPendingTask(p.ID, ""); t != nil {
			a.Face, a.HasFace = cpuYawTo(p.Transform.Position, cpuSpotOf(p.Seat, st.cpuSpotFor(p, t)).At), true
		}
		st.CPUAgents[p.ID] = a
	}
}

func (st *State) cpuMarkMoved(p *PlayerState) {
	p.reported = true
	p.moved = true
	p.Transform.Seq++
}

func (st *State) cpuNewID() string {
	st.CPUItemSeq++
	return "cpu-" + strconv.Itoa(st.CPUItemSeq)
}

func (st *State) cpuStep(now time.Time) []Output {
	if st.Status != api.SessionStatusPlaying && st.Status != api.SessionStatusIntermission {
		return nil
	}
	dt := 0.0
	if !st.CPULastAt.IsZero() {
		dt = now.Sub(st.CPULastAt).Seconds()
	}
	if dt < 0 || dt > 1 {
		dt = 0.05
	}
	st.CPULastAt = now

	var out []Output
	for i := range st.Players {
		p := &st.Players[i]
		if p.Kind != api.Cpu || p.Life != api.Alive {
			continue
		}
		a, ok := st.CPUAgents[p.ID]
		if !ok {
			continue
		}
		out = append(out, st.cpuAdvance(p, &a, dt, now)...)
		st.cpuPose(p, &a, dt, now)
		st.CPUAgents[p.ID] = a
	}
	return out
}

func (st *State) cpuActive() bool {
	return st.Status == api.SessionStatusPlaying && st.Phase.Status == api.PhaseStatusActive
}

func (st *State) cpuAdvance(p *PlayerState, a *CPUAgent, dt float64, now time.Time) []Output {
	if !st.cpuActive() && a.Goal != cpuGoalRest {
		a.Dawdle = time.Time{}
		st.cpuGoRest(p, a, now)
	}
	if !a.Dawdle.IsZero() && (!now.Before(a.Dawdle) || st.cpuUrgency(p.ID, now) >= cpuCalm) {
		a.Dawdle = time.Time{}
		a.Stage = cpuStageIdle
	}
	switch a.Stage {
	case cpuStageIdle:
		return st.cpuStartTask(p, a, now)
	case cpuStageWalk:
		if a.Goal == cpuGoalRest && st.cpuCanPlay(p, a, now) && rand.New(&st.rng).Float64() < a.Persona.Playful*0.25*dt {
			st.cpuJump(p, a, now, 2.2+0.6*rand.New(&st.rng).Float64(), 0)
		}
		if st.cpuWalk(p, a, dt, now) {
			a.Stage = cpuStageFace
			a.Face, a.HasFace = cpuYawTo(p.Transform.Position, a.Spot.Look), true
			a.Pitch = a.Spot.Pitch
		}
	case cpuStageFace:
		if math.Abs(angleDiff(a.Face, p.Transform.Yaw)) <= cpuFaceEpsilon {
			return st.cpuArrive(p, a, now)
		}
	case cpuStageWorking:
		if !now.Before(a.Until) {
			st.cpuAfterWork(p, a, now)
		}
	case cpuStageWait:
		if !now.Before(a.Until) {
			a.Stage = a.Resume
		}
	case cpuStageRest:
		if !now.Before(a.Until) {
			st.cpuFidget(p, a, now)
		}
	}
	return nil
}

func (st *State) cpuArrive(p *PlayerState, a *CPUAgent, now time.Time) []Output {
	switch a.Goal {
	case cpuGoalFetch:
		if !a.Looked && st.cpuUrgency(p.ID, now) < cpuCalm {
			a.Looked = true
			r := rand.New(&st.rng)
			a.Face = normalizeAngle(a.Face + (r.Float64()*2-1)*0.6)
			st.cpuWait(a, now, st.cpuRandDur(400*time.Millisecond, 1000*time.Millisecond), cpuStageWalk)
			return nil
		}
		return st.cpuFetch(p, a, now)
	case cpuGoalWork:
		return st.cpuWork(p, a, now)
	case cpuGoalDeliver:
		return st.cpuDeliver(p, a, now)
	case cpuGoalSlip:
		a.Slipped = true
		a.Pitch = 0
		if t := st.cpuTask(p.ID, a.TaskID); t != nil {
			a.Face = cpuYawTo(p.Transform.Position, cpuSpotOf(p.Seat, st.cpuSpotFor(p, t)).At)
		}
		st.cpuWait(a, now, st.cpuRandDur(800*time.Millisecond, 1400*time.Millisecond), cpuStageIdle)
	case cpuGoalRest:
		a.Pitch = 0
		a.Stage = cpuStageRest
		a.Until = now.Add(st.cpuRandDur(2*time.Second, 5*time.Second))
	case cpuGoalWander:
		a.Stage = cpuStageRest
		a.Until = now.Add(st.cpuRandDur(1*time.Second, 2500*time.Millisecond))
	}
	return nil
}

func (st *State) cpuCanPlay(p *PlayerState, a *CPUAgent, now time.Time) bool {
	return !a.Air && !now.Before(a.Play) && st.cpuUrgency(p.ID, now) < cpuCalm
}

func (st *State) cpuJump(p *PlayerState, a *CPUAgent, now time.Time, v float64, hops int) {
	if a.Air || len(p.Transform.Position) != 3 {
		return
	}
	a.Air = true
	a.VelY = v
	a.Hops = hops
	a.Play = now.Add(st.cpuRandDur(6*time.Second, 15*time.Second))
}

func (st *State) cpuDawdleFor(p *PlayerState, a *CPUAgent, t *TaskState, now time.Time) time.Duration {
	if a.Dawdled == t.ID || st.cpuUrgency(p.ID, now) >= cpuCalm {
		return 0
	}
	a.Dawdled = t.ID
	r := rand.New(&st.rng)
	if r.Float64() >= a.Persona.Dawdle {
		return 0
	}
	spare := st.Phase.DeadlineAt.Sub(now) - time.Duration(st.cpuPendingCount(p.ID))*cpuTaskEstimate - cpuSafetyMargin
	if spare < 3*time.Second {
		return 0
	}
	return min(time.Duration(float64(spare)*(0.25+0.3*r.Float64())), 25*time.Second)
}

func (st *State) cpuWait(a *CPUAgent, now time.Time, d time.Duration, resume cpuStage) {
	a.Stage = cpuStageWait
	a.Resume = resume
	a.Until = now.Add(d)
}

func (st *State) cpuRandDur(lo, hi time.Duration) time.Duration {
	if hi <= lo {
		return lo
	}
	return lo + time.Duration(rand.New(&st.rng).Int64N(int64(hi-lo)))
}

func (st *State) cpuUrgency(playerID string, now time.Time) float64 {
	pending := 0
	for _, t := range st.Phase.Tasks {
		if t.Assignee == playerID && t.CompletedAt.IsZero() {
			pending++
		}
	}
	if pending == 0 {
		return 0
	}
	slack := st.Phase.DeadlineAt.Sub(now).Seconds() / (float64(pending) * cpuTaskEstimate.Seconds())
	return math.Max(0, math.Min(1, 2-slack))
}

func (st *State) cpuWalkTo(p *PlayerState, a *CPUAgent, goal cpuGoal, spot cpuSpot) {
	a.Stage = cpuStageWalk
	a.Goal = goal
	a.Spot = spot
	a.HasFace = false
	a.Pitch = 0
	a.Looked = false
}

func (st *State) cpuWalk(p *PlayerState, a *CPUAgent, dt float64, now time.Time) bool {
	pos := p.Transform.Position
	if len(pos) != 3 {
		p.Transform.Position = []float64{a.Spot.At[0], a.Spot.At[1], a.Spot.At[2]}
		st.cpuMarkMoved(p)
		return true
	}
	dx := a.Spot.At[0] - pos[0]
	dz := a.Spot.At[2] - pos[2]
	dist := math.Hypot(dx, dz)
	if dist <= cpuReachEpsilon {
		a.Speed = 0
		return true
	}

	turn := a.Persona.TurnSpeed
	if a.Goal != cpuGoalRest {
		turn *= 1 + 0.5*st.cpuUrgency(p.ID, now)
	}
	diff := angleDiff(math.Atan2(-dx, -dz), p.Transform.Yaw)
	st.cpuTurn(p, diff, turn*dt)
	diff = angleDiff(math.Atan2(-dx, -dz), p.Transform.Yaw)

	limit := a.Persona.WalkSpeed
	switch a.Goal {
	case cpuGoalRest:
		limit *= 0.55
	default:
		limit *= 1 + a.Persona.Hurry*st.cpuUrgency(p.ID, now)
	}
	if math.Abs(diff) >= cpuTurnInPlace {
		limit = 0
	} else {
		limit *= 1 - 0.7*math.Abs(diff)/cpuTurnInPlace
	}
	limit = math.Min(limit, math.Max(cpuMinSpeed, math.Sqrt(2*cpuDecel*dist)))
	if a.Speed < limit {
		a.Speed = math.Min(limit, a.Speed+cpuAccel*dt)
	} else {
		a.Speed = math.Max(limit, a.Speed-cpuDecel*2*dt)
	}

	step := a.Speed * dt
	if step <= 0 {
		return false
	}
	if step >= dist {
		p.Transform.Position = []float64{a.Spot.At[0], pos[1], a.Spot.At[2]}
		st.cpuMarkMoved(p)
		a.Speed = 0
		return true
	}
	p.Transform.Position = []float64{
		pos[0] + dx/dist*step,
		pos[1],
		pos[2] + dz/dist*step,
	}
	st.cpuMarkMoved(p)
	return false
}

func (st *State) cpuTurn(p *PlayerState, diff, maxStep float64) {
	if diff == 0 || maxStep <= 0 {
		return
	}
	step := math.Max(-maxStep, math.Min(maxStep, diff))
	p.Transform.Yaw = normalizeAngle(p.Transform.Yaw + step)
	st.cpuMarkMoved(p)
}

func (st *State) cpuPose(p *PlayerState, a *CPUAgent, dt float64, now time.Time) {
	if a.Stage != cpuStageWalk && a.HasFace {
		if diff := angleDiff(a.Face, p.Transform.Yaw); math.Abs(diff) > 1e-3 {
			st.cpuTurn(p, diff, a.Persona.TurnSpeed*0.6*dt)
		}
	}
	if !a.Air && a.Hops > 0 && !now.Before(a.HopAt) {
		st.cpuJump(p, a, now, 2.4+0.8*rand.New(&st.rng).Float64(), a.Hops-1)
	}
	if a.Air && len(p.Transform.Position) == 3 {
		y := p.Transform.Position[1] + a.VelY*dt
		a.VelY -= cpuGravity * dt
		if y <= cpuGroundY {
			y = cpuGroundY
			a.Air = false
			a.VelY = 0
			a.HopAt = now.Add(st.cpuRandDur(150*time.Millisecond, 300*time.Millisecond))
		}
		p.Transform.Position = []float64{p.Transform.Position[0], y, p.Transform.Position[2]}
		st.cpuMarkMoved(p)
	}
	pitch := a.Pitch
	if a.Stage == cpuStageWorking {
		pitch += 0.07 * math.Sin(float64(now.UnixMilli()%100000)/1000*7)
	}
	if diff := pitch - p.Transform.Pitch; math.Abs(diff) > 1e-3 {
		maxStep := cpuPitchSpeed * dt
		p.Transform.Pitch += math.Max(-maxStep, math.Min(maxStep, diff))
		if !p.moved {
			st.cpuMarkMoved(p)
		}
	}
}

func (st *State) cpuFidget(p *PlayerState, a *CPUAgent, now time.Time) {
	r := rand.New(&st.rng)
	a.Until = now.Add(st.cpuRandDur(2500*time.Millisecond, 6*time.Second))
	if a.Doomed && st.cpuActive() && st.cpuPendingCount(p.ID) > 0 && r.Float64() < 0.45 {
		spots := []cpuSpot{cpuLocalDirectory, cpuLocalDesk, cpuLocalCanvas}
		st.cpuWalkTo(p, a, cpuGoalWander, cpuSpotOf(p.Seat, spots[r.IntN(len(spots))]))
		return
	}
	if r.Float64() < 0.15 {
		st.cpuGoRest(p, a, now)
		return
	}
	if st.cpuCanPlay(p, a, now) && r.Float64() < a.Persona.Playful*0.7 {
		st.cpuJump(p, a, now, 2.5+r.Float64(), r.IntN(3))
		return
	}
	if target, ok := st.cpuSomeoneToWatch(p, r.Float64()); ok && r.Float64() < 0.5 {
		a.Face, a.HasFace = cpuYawTo(p.Transform.Position, target), true
		return
	}
	base := cpuYawTo(p.Transform.Position, a.Spot.Look)
	a.Face, a.HasFace = normalizeAngle(base+(r.Float64()*2-1)*0.9), true
}

func (st *State) cpuSomeoneToWatch(self *PlayerState, pick float64) ([3]float64, bool) {
	var humans, others [][3]float64
	for _, q := range st.Players {
		if q.ID == self.ID || q.Life != api.Alive || len(q.Transform.Position) != 3 {
			continue
		}
		pos := [3]float64{q.Transform.Position[0], q.Transform.Position[1], q.Transform.Position[2]}
		if q.Kind == api.Cpu {
			others = append(others, pos)
		} else {
			humans = append(humans, pos)
		}
	}
	pool := others
	if len(humans) > 0 && (pick < 0.7 || len(others) == 0) {
		pool = humans
	}
	if len(pool) == 0 {
		return [3]float64{}, false
	}
	return pool[int(pick*1000)%len(pool)], true
}

func (st *State) cpuGoRest(p *PlayerState, a *CPUAgent, _ time.Time) {
	r := rand.New(&st.rng)
	spot := cpuLocalRests[r.IntN(len(cpuLocalRests))]
	world := cpuSpotOf(p.Seat, spot)
	if len(p.Transform.Position) == 3 && math.Hypot(world.At[0]-p.Transform.Position[0], world.At[2]-p.Transform.Position[2]) < 0.5 {
		spot = cpuLocalRests[(r.IntN(len(cpuLocalRests)-1)+1+indexOfSpot(spot))%len(cpuLocalRests)]
		world = cpuSpotOf(p.Seat, spot)
	}
	st.cpuWalkTo(p, a, cpuGoalRest, world)
}

func indexOfSpot(s cpuSpot) int {
	for i, r := range cpuLocalRests {
		if r == s {
			return i
		}
	}
	return 0
}

func (st *State) cpuSpotFor(p *PlayerState, t *TaskState) cpuSpot {
	held := st.held(p.ID)
	switch {
	case held != nil && (held.Kind != api.File || held.Status != api.FileStatusUnedited || t.Type != api.ReadEdit):
		return cpuLocalDirectory
	case t.Type == api.ReadEdit && held == nil:
		return cpuLocalDirectory
	default:
		return cpuStation(t.Type)
	}
}

func (st *State) cpuStartTask(p *PlayerState, a *CPUAgent, now time.Time) []Output {
	t := st.cpuPendingTask(p.ID, a.TaskID)
	if t == nil {
		st.cpuGoRest(p, a, now)
		return nil
	}
	if a.TaskID != t.ID {
		a.TaskID = t.ID
		a.Slipped = false
	}
	if a.Doomed && st.cpuPendingCount(p.ID) == 1 && st.held(p.ID) == nil {
		st.cpuGoRest(p, a, now)
		return nil
	}
	held := st.held(p.ID)
	if held == nil {
		if d := st.cpuDawdleFor(p, a, t, now); d > 0 {
			st.cpuGoRest(p, a, now)
			a.Dawdle = now.Add(d)
			return nil
		}
	}
	r := rand.New(&st.rng)
	local := st.cpuSpotFor(p, t)
	goal := cpuGoalWork
	switch {
	case held != nil && local == cpuLocalDirectory:
		goal = cpuGoalDeliver
	case local == cpuLocalDirectory:
		goal = cpuGoalFetch
	}
	spot := cpuSpotOf(p.Seat, local)

	if goal == cpuGoalWork && !a.Slipped && r.Float64() < a.Persona.Slip && len(p.Transform.Position) == 3 {
		wrong := cpuLocalCanvas
		if local == cpuLocalCanvas {
			wrong = cpuLocalDesk
		}
		w := cpuSpotOf(p.Seat, wrong)
		pos := p.Transform.Position
		k := 0.4 + 0.2*r.Float64()
		mid := [3]float64{pos[0] + (w.At[0]-pos[0])*k, w.At[1], pos[2] + (w.At[2]-pos[2])*k}
		st.cpuWalkTo(p, a, cpuGoalSlip, cpuSpot{At: mid, Look: w.Look})
		return nil
	}
	st.cpuWalkTo(p, a, goal, spot)
	return nil
}

func (st *State) cpuFetch(p *PlayerState, a *CPUAgent, now time.Time) []Output {
	t := st.cpuTask(p.ID, a.TaskID)
	dir := st.object(directoryID)
	if t == nil || dir == nil {
		a.Stage = cpuStageIdle
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
		a.TaskID = ""
		r := rand.New(&st.rng)
		a.Face = normalizeAngle(p.Transform.Yaw + (r.Float64()*2-1)*0.7)
		if it := st.item(target); it != nil && it.Location.Kind == HeldBy {
			if holder := st.player(it.Location.PlayerID); holder != nil && len(holder.Transform.Position) == 3 {
				a.Face = cpuYawTo(p.Transform.Position, [3]float64{holder.Transform.Position[0], 0, holder.Transform.Position[2]})
			}
		}
		wait := st.cpuRandDur(2*time.Second, 3500*time.Millisecond)
		if other := st.cpuPendingTask(p.ID, ""); other != nil && other.ID != t.ID {
			wait = st.cpuRandDur(700*time.Millisecond, 1300*time.Millisecond)
		} else if st.cpuCanPlay(p, a, now) && r.Float64() < a.Persona.Playful*0.4 {
			st.cpuJump(p, a, now, 2.2+0.5*r.Float64(), 0)
		}
		st.cpuWait(a, now, wait, cpuStageIdle)
		return out
	}
	st.cpuWait(a, now, st.cpuThink(p.ID, now)/2, cpuStageIdle)
	return out
}

func (st *State) cpuThink(playerID string, now time.Time) time.Duration {
	a := st.CPUAgents[playerID]
	if a.Persona.ThinkPause <= 0 {
		return 0
	}
	scale := 1 - 0.8*st.cpuUrgency(playerID, now)
	return time.Duration(float64(st.cpuRandDur(a.Persona.ThinkPause/3, a.Persona.ThinkPause)) * scale)
}

func (st *State) cpuWork(p *PlayerState, a *CPUAgent, now time.Time) []Output {
	t := st.cpuTask(p.ID, a.TaskID)
	if t == nil {
		a.Stage = cpuStageIdle
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
		st.cpuWait(a, now, 500*time.Millisecond, cpuStageIdle)
		return out
	}
	jitter := time.Duration(0)
	if a.Persona.JitterMax > 0 {
		jitter = time.Duration(rand.New(&st.rng).Int64N(int64(a.Persona.JitterMax)) + 1)
	}
	st.Actions[len(st.Actions)-1].DueAt = st.Actions[len(st.Actions)-1].DueAt.Add(jitter)
	a.Stage = cpuStageWorking
	a.Until = st.Actions[len(st.Actions)-1].DueAt
	return out
}

func (st *State) cpuAfterWork(p *PlayerState, a *CPUAgent, now time.Time) {
	a.Pitch = -0.6
	st.cpuWait(a, now, st.cpuThink(p.ID, now)/2+150*time.Millisecond, cpuStageIdle)
}

func (st *State) cpuDeliver(p *PlayerState, a *CPUAgent, now time.Time) []Output {
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
	a.TaskID = ""
	if st.cpuActive() {
		st.cpuWait(a, now, st.cpuThink(p.ID, now), cpuStageIdle)
		if r := rand.New(&st.rng); !a.Air && st.cpuUrgency(p.ID, now) < cpuCalm && r.Float64() < a.Persona.Playful*0.5 {
			st.cpuJump(p, a, now, 1.8+0.4*r.Float64(), 0)
		}
	}
	return out
}

func (st *State) cpuPendingCount(playerID string) int {
	n := 0
	for _, t := range st.Phase.Tasks {
		if t.Assignee == playerID && t.CompletedAt.IsZero() {
			n++
		}
	}
	return n
}

func (st *State) cpuPendingTask(playerID, prefer string) *TaskState {
	var first, ready *TaskState
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.Assignee != playerID || !t.CompletedAt.IsZero() {
			continue
		}
		if t.ID == prefer {
			return t
		}
		if first == nil {
			first = t
		}
		if ready == nil && st.cpuTaskReady(playerID, t) {
			ready = t
		}
	}
	if ready != nil {
		return ready
	}
	return first
}

func (st *State) cpuTaskReady(playerID string, t *TaskState) bool {
	if t.Type != api.ReadEdit {
		return true
	}
	it := st.item(t.TargetFileID)
	return it != nil && ((it.Location.Kind == InDirectory) || (it.Location.Kind == HeldBy && it.Location.PlayerID == playerID))
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

func cpuYawTo(from []float64, to [3]float64) float64 {
	if len(from) != 3 {
		return 0
	}
	return math.Atan2(-(to[0] - from[0]), -(to[2] - from[2]))
}

func normalizeAngle(a float64) float64 {
	a = math.Mod(a+math.Pi, 2*math.Pi)
	if a < 0 {
		a += 2 * math.Pi
	}
	return a - math.Pi
}

func angleDiff(to, from float64) float64 {
	return normalizeAngle(to - from)
}

func heldRef(it *ItemState) *api.HeldItemRef {
	if it == nil {
		return nil
	}
	return &api.HeldItemRef{Id: it.ID, Kind: it.Kind}
}
