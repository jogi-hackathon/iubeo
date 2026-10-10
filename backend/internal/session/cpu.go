package session

import (
	"math"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// CPU は人間と同じ段取りで動く: ディレクトリから取り出す → 作業台へ歩く → 作業する → ディレクトリへ戻す。
// 移動も作業もサーバーが時間をかけて進めるので、他の人からは「そこに居て、歩いて、作業している」ように見える。
// 速さ・段取り・成功率は個体ごとに違い、たまには失敗もする(全員が毎フェーズ成功するわけではない)。
// 達成の判定は人間と同じ completeTask を通すので、CPU だけ特別扱いしない
const (
	// cpuWalkSpeed は歩く速さ(m/s)。人間の歩きに近いが、少しゆっくりめ
	cpuWalkSpeed = 2.4
	// cpuReachEpsilon は目的地に着いたとみなす距離(m)
	cpuReachEpsilon = 0.2
	// cpuMinReliability は、フェーズごとのノルマを落とさない確率の下限
	cpuMinReliability = 0.7
)

// cpuStage は 1 体の CPU が今していること
type cpuStage int

const (
	// cpuStageIdle は次のノルマを選ぶところ
	cpuStageIdle cpuStage = iota
	// cpuStageFetch は取り出す物(ディレクトリ)へ歩いている
	cpuStageFetch
	// cpuStageToStation は作業台へ歩いている
	cpuStageToStation
	// cpuStageWorking は作業中(サーバーの ObjectAction が終わるのを待つ)
	cpuStageWorking
	// cpuStageDeliver は成果物をディレクトリへ戻すために歩いている
	cpuStageDeliver
	// cpuStageWait は相手を待っている(人間が対象のファイルを持っているなど)
	cpuStageWait
	// cpuStageDone はこのフェーズではもう動かない(ノルマが無い、または失敗を選んだ)
	cpuStageDone
)

// CpuAgent は CPU 1 体の段取り。フェーズごとに resetCpuAgents で作り直す
type CpuAgent struct {
	Stage  cpuStage
	TaskID string
	// Target は今向かっている足元の位置
	Target [3]float64
	// Until は待ち(work・wait)の終わり。この時刻までは動かない
	Until time.Time
	// Resume は待ちが明けたら戻る段階
	Resume cpuStage
	// Reliability はこの CPU がフェーズごとのノルマを落とさない確率(0.7〜1.0)
	Reliability float64
	// Skip はこのタスクを「最後に戻さない」= 失敗を選んだ。人間でもあること
	Skip bool
}

// resetCpuAgents はフェーズ開始時に CPU の段取りを引き直す。区画のスポーン地点に立ち、個体差を作る
func (st *State) resetCpuAgents() {
	st.CpuAgents = map[string]CpuAgent{}
	st.CpuLastAt = time.Time{}
	r := rand.New(&st.rng)
	for i := range st.Players {
		p := &st.Players[i]
		if p.Kind != api.Cpu || p.Life != api.Alive {
			continue
		}
		pos := cpuWaypoint(p.Seat, cpuLocalSpawn)
		p.Transform.Position = []float64{pos[0], pos[1], pos[2]}
		p.Transform.Yaw = cpuSeatYaw(p.Seat)
		st.cpuMarkMoved(p)
		st.CpuAgents[p.ID] = CpuAgent{
			Stage:       cpuStageIdle,
			Reliability: cpuMinReliability + r.Float64()*(1-cpuMinReliability),
		}
	}
}

func (st *State) cpuMarkMoved(p *PlayerState) {
	p.reported = true
	p.moved = true
	p.Transform.Seq++
	// 区画から出ないように、歩く先は常に自分の区画の内側
}

func (st *State) cpuNewID() string {
	st.CpuItemSeq++
	return "cpu-" + strconv.Itoa(st.CpuItemSeq)
}

// cpuStep は CPU を少しだけ進める。tick から呼ぶ
func (st *State) cpuStep(now time.Time) []Output {
	if st.Status != api.SessionStatusPlaying || st.Phase.Status != api.PhaseStatusActive {
		return nil
	}
	dt := 0.0
	if !st.CpuLastAt.IsZero() {
		dt = now.Sub(st.CpuLastAt).Seconds()
	}
	if dt < 0 || dt > 1 {
		// 長く止まっていた分をまとめて進めない(瞬間移動に見えるため)
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

// cpuMove は目的地へ dt 秒ぶん歩く。着いたら true
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
	step := cpuWalkSpeed * dt
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
	// 向きは実際に進む向き(yaw=0 で -Z)。ハンドラの向きは歩きに合わせる
	p.Transform.Yaw = math.Atan2(-dx, -dz)
	st.cpuMarkMoved(p)
	return false
}

// cpuStartTask は次の未完了のノルマを選び、最初に向かう場所を決める
func (st *State) cpuStartTask(p *PlayerState, a *CpuAgent, now time.Time) []Output {
	t := st.cpuPendingTask(p.ID)
	if t == nil {
		a.Stage = cpuStageDone
		return nil
	}
	a.TaskID = t.ID
	r := rand.New(&st.rng)
	a.Skip = r.Float64() > a.Reliability
	if t.Type == api.ReadEdit {
		a.Stage = cpuStageFetch
		a.Target = cpuWaypoint(p.Seat, cpuLocalDirectory)
	} else {
		a.Stage = cpuStageToStation
		a.Target = cpuWaypoint(p.Seat, cpuStation(t.Type))
	}
	return nil
}

// cpuFetch はディレクトリから対象のファイルを取り出す。取れなければ少し待ってやり直す
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
		// 人間がそのファイルを持っているなど。すぐには取れないので、少し待って戻る
		a.Stage = cpuStageWait
		a.Resume = cpuStageFetch
		a.Until = now.Add(500 * time.Millisecond)
		return out
	}
	a.Stage = cpuStageToStation
	a.Target = cpuWaypoint(p.Seat, cpuStation(t.Type))
	return out
}

// cpuWork は作業台で作業を始める(サーバーの ObjectAction に乗る)。始められなければ少し待つ
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
		// 誰かが作業台を使っているなどで始められなかった
		a.Stage = cpuStageWait
		a.Resume = cpuStageToStation
		a.Until = now.Add(500 * time.Millisecond)
		return out
	}
	// 人間らしい揺らぎ: 作業の終わりを少しだけ延ばす(0〜700ms)
	jitter := time.Duration(rand.New(&st.rng).IntN(700)) * time.Millisecond
	st.Actions[len(st.Actions)-1].DueAt = st.Actions[len(st.Actions)-1].DueAt.Add(jitter)
	a.Stage = cpuStageWorking
	a.Until = st.Actions[len(st.Actions)-1].DueAt
	return out
}

// cpuAfterWork は作業が終わった後を決める。失敗を選んだ個体は、戻さずにそのままにする
func (st *State) cpuAfterWork(p *PlayerState, a *CpuAgent) {
	if a.Skip {
		a.Stage = cpuStageDone
		return
	}
	a.Stage = cpuStageDeliver
	a.Target = cpuWaypoint(p.Seat, cpuLocalDirectory)
}

// cpuDeliver は成果物をディレクトリへ戻す。達成の判定は interactDirectory の中で人間と同じ completeTask が行う
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
