package session

import (
	"math"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

func newCPUState(t *testing.T, humans, cpus []string) State {
	t.Helper()
	// CPU のテストは 1 分のフェーズと 15 秒のインターミッションを前提に時間を組んでいる
	rules := DefaultConfig.Phases
	rules.Duration = time.Minute
	rules.Intermission = 15 * time.Second
	st := NewMultiplayerState("sess-1", humans, cpus, t0, Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, rules, 1)
	for i, p := range humans {
		st, _ = step(t, st, Connect{PlayerID: p, ConnID: uint64(i + 1), Now: t0})
	}
	if st.Status != api.SessionStatusPlaying {
		t.Fatalf("status = %s, want playing(CPU の接続を待たない)", st.Status)
	}
	return st
}

func forceReliable(st State, ids ...string) State {
	for _, id := range ids {
		a := st.CPUAgents[id]
		a.Doomed = false
		a.Persona.Slip = 0
		a.Persona.Dawdle = 0
		a.Persona.Playful = 0
		st.CPUAgents[id] = a
	}
	return st
}

func advanceCPU(t *testing.T, st State, start time.Time, d time.Duration) (State, []Output) {
	t.Helper()
	const tick = 50 * time.Millisecond
	var all []Output
	for el := tick; el <= d; el += tick {
		var out []Output
		st, out = step(t, st, Tick{Now: start.Add(el)})
		all = append(all, out...)
	}
	return st, all
}

func pendingTaskOf(st State, playerID string) *TaskState {
	for i := range st.Phase.Tasks {
		t := &st.Phase.Tasks[i]
		if t.Assignee == playerID && t.CompletedAt.IsZero() {
			return t
		}
	}
	return nil
}

func TestCPUStartsWithoutConnecting(t *testing.T) {
	st := newCPUState(t, []string{"p1"}, []string{"cpu-1", "cpu-2"})
	cpu := st.player("cpu-1")
	if cpu == nil || cpu.Kind != api.Cpu || cpu.Connection != api.Connected {
		t.Fatalf("cpu-1 = %+v, want cpu/connected", cpu)
	}
	if seat := st.player("p1").Seat; seat != 1 {
		t.Errorf("p1 seat = %d, want 1(人間が先)", seat)
	}
	if seat := st.player("cpu-1").Seat; seat != 2 {
		t.Errorf("cpu-1 seat = %d, want 2", seat)
	}
	if len(st.Phase.Tasks) != 3 {
		t.Errorf("tasks = %d, want 3", len(st.Phase.Tasks))
	}
	if cpu.Transform.Position == nil || !cpu.reported {
		t.Errorf("cpu-1 transform = %+v, want reported at spawn", cpu.Transform)
	}
}

func TestCPUAssignsPersonas(t *testing.T) {
	st := newCPUState(t, []string{"p1"}, []string{"cpu-1", "cpu-2"})
	p1, ok1 := st.CPUPersonas["cpu-1"]
	p2, ok2 := st.CPUPersonas["cpu-2"]
	if !ok1 || !ok2 || p1.Name == "" || p2.Name == "" {
		t.Fatalf("personas = %+v, %+v", p1, p2)
	}
	if p1.Name == p2.Name {
		t.Errorf("同じ人格が当たっている: %q", p1.Name)
	}
}

func TestCPUWalksAndCompletesTask(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.ReadEdit, Assignee: "cpu-1", TargetFileID: f1},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")
	before := st.player("cpu-1").Transform.Position

	st, out := advanceCPU(t, st, t0, 40*time.Second)

	done := msgsOf[api.TaskCompletedMessage](out)
	if len(done) != 1 || done[0].TaskId != "task-cpu" {
		t.Fatalf("task.completed = %+v, want task-cpu", done)
	}
	if len(msgsOf[api.ObjectUpsertMessage](out)) == 0 {
		t.Errorf("山の中身が配られていない")
	}
	if pendingTaskOf(st, "cpu-1") != nil {
		t.Errorf("CPU のタスクが残っている: %+v", st.Phase.Tasks)
	}
	if pendingTaskOf(st, "p1") == nil {
		t.Errorf("人間のタスクまで終わっている: %+v", st.Phase.Tasks)
	}
	it := st.item(f1)
	if it == nil || it.Location.Kind != InDirectory {
		t.Errorf("file = %+v, want back in directory", it)
	}
	after := st.player("cpu-1").Transform.Position
	if after[0] == before[0] && after[2] == before[2] {
		t.Errorf("CPU が動いていない: %v", after)
	}
	if len(msgsOf[api.TransformsMessage](out)) == 0 {
		t.Errorf("CPU の transforms が配られていない")
	}
}

func TestCPUWaitsForFileHeldByHuman(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.ReadEdit, Assignee: "cpu-1", TargetFileID: f1},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")
	st = take(t, st, "p1", f1)

	st, out := advanceCPU(t, st, t0, 20*time.Second)
	if len(msgsOf[api.TaskCompletedMessage](out)) != 0 {
		t.Fatalf("人間が持っているのに達成した: %+v", out)
	}
	if pendingTaskOf(st, "cpu-1") == nil {
		t.Errorf("CPU のタスクが終わっている: %+v", st.Phase.Tasks)
	}
	if st.held("cpu-1") != nil {
		t.Errorf("CPU が勝手に持っている: %+v", st.held("cpu-1"))
	}
}

func TestCPUAndHumanClearLastPhase(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st.Phases.Count = 1
	st = forceReliable(st, "cpu-1")

	st = create(t, st, "p1", "human-file")
	st, out := put(t, st, "p1")
	if len(msgsOf[api.TaskCompletedMessage](out)) == 0 {
		t.Fatalf("人間のタスクが達成にならない: %+v", out)
	}
	st, _ = advanceCPU(t, st, t0, 20*time.Second)
	if st.Phase.Status != api.PhaseStatusCompleted {
		t.Fatalf("phase = %s, want completed", st.Phase.Status)
	}
	if !st.Team.BypassPermission {
		t.Errorf("bypassPermission = false, want true(最終フェーズを生き残った)")
	}
	if st.Ended {
		t.Errorf("ended early: %+v", st.Result)
	}
}

func TestCPUSurvivesHumanAndTimesOutToVictory(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st.Phases.Count = 1
	st = forceReliable(st, "cpu-1")

	st, _ = advanceCPU(t, st, t0, 40*time.Second)
	st, out := step(t, st, Tick{Now: st.Phase.DeadlineAt})
	ended := msgsOf[api.PhaseEndedMessage](out)
	if len(ended) != 1 || len(ended[0].EliminatedPlayerIds) != 1 || ended[0].EliminatedPlayerIds[0] != "p1" {
		t.Fatalf("phase.ended = %+v, want p1 脱落", ended)
	}
	if st.Ended || st.Status == api.SessionStatusFinished {
		t.Fatalf("CPU が生きているのに終わった: %+v", st.Result)
	}
	if !st.Team.BypassPermission {
		t.Fatalf("bypassPermission = false")
	}

	st, out = step(t, st, Tick{Now: st.BypassAt.Add(st.Phases.Bypass)})
	fin := msgsOf[api.SessionFinishedMessage](out)
	if len(fin) != 1 || fin[0].Result.Outcome != api.Victory {
		t.Fatalf("session.finished = %+v, want victory", fin)
	}
}

func TestCPUCompletesWebSearch(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.WebSearch, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")

	st, out := advanceCPU(t, st, t0, 40*time.Second)
	done := msgsOf[api.TaskCompletedMessage](out)
	if len(done) != 1 || done[0].TaskId != "task-cpu" {
		t.Fatalf("task.completed = %+v, want task-cpu", done)
	}
	found := false
	for _, it := range st.Items {
		if it.Status == api.FileStatusSearchCreated && it.Location.Kind == InDirectory {
			found = true
		}
	}
	if !found {
		t.Errorf("search_created が山にない: %+v", st.Items)
	}
}

func TestCPUSpotsStayOutsideDirectory(t *testing.T) {
	const clearance = 3.6 + 0.3
	spots := append([]cpuSpot{cpuLocalDirectory, cpuLocalDesk, cpuLocalCanvas}, cpuLocalRests...)
	for _, s := range spots {
		if d := math.Hypot(s.At[0], s.At[2]); d < clearance {
			t.Errorf("spot %v は紙の山から %.2f しか離れていない(want >= %.2f)", s.At, d, clearance)
		}
	}
}

func TestCPUFacesStationWhileWorking(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")
	const tick = 50 * time.Millisecond
	for el := tick; el <= 20*time.Second; el += tick {
		st, _ = step(t, st, Tick{Now: t0.Add(el)})
		if st.CPUAgents["cpu-1"].Stage == cpuStageWorking {
			cpu := st.player("cpu-1")
			desk := cpuSpotOf(cpu.Seat, cpuLocalDesk)
			if d := math.Hypot(cpu.Transform.Position[0]-desk.At[0], cpu.Transform.Position[2]-desk.At[2]); d > 0.05 {
				t.Errorf("机の前に立っていない: %v", cpu.Transform.Position)
			}
			if diff := angleDiff(cpuYawTo(cpu.Transform.Position, desk.Look), cpu.Transform.Yaw); math.Abs(diff) > cpuFaceEpsilon {
				t.Errorf("机を向いていない: yaw ずれ %.2f", diff)
			}
			return
		}
	}
	t.Fatal("作業を始めなかった")
}

func TestCPUKeepsPositionOnNewPhase(t *testing.T) {
	st := newCPUState(t, []string{"p1"}, []string{"cpu-1"})
	cpu := st.player("cpu-1")
	cpu.Transform.Position = []float64{1, 0.05, 5}
	st.resetCPUAgents(t0)
	if got := st.player("cpu-1").Transform.Position; got[0] != 1 || got[2] != 5 {
		t.Errorf("フェーズの頭でワープした: %v", got)
	}
}

func TestCPUSwitchesToReadyTask(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-edit", Type: api.ReadEdit, Assignee: "cpu-1", TargetFileID: f1},
		TaskState{ID: "task-write", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")
	st = take(t, st, "p1", f1)

	_, out := advanceCPU(t, st, t0, 25*time.Second)
	done := msgsOf[api.TaskCompletedMessage](out)
	if len(done) != 1 || done[0].TaskId != "task-write" {
		t.Fatalf("task.completed = %+v, want task-write だけ(取れない読み込みは後回し)", done)
	}
}

func TestCPUDoomedLeavesFilesAlone(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.ReadEdit, Assignee: "cpu-1", TargetFileID: f1},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	a := st.CPUAgents["cpu-1"]
	a.Doomed = true
	st.CPUAgents["cpu-1"] = a

	st, out := advanceCPU(t, st, t0, 40*time.Second)
	if len(msgsOf[api.TaskCompletedMessage](out)) != 0 {
		t.Fatalf("失敗するはずの CPU が達成した")
	}
	if st.held("cpu-1") != nil {
		t.Errorf("失敗する CPU がファイルを抱えている: %+v", st.held("cpu-1"))
	}
	if it := st.item(f1); it.Location.Kind != InDirectory {
		t.Errorf("file = %+v, want 山の中(ほかの人が取れる)", it)
	}
	if g := st.CPUAgents["cpu-1"].Goal; g != cpuGoalRest && g != cpuGoalWander {
		t.Errorf("goal = %d, want rest か wander(手が止まってうろうろする)", g)
	}
}

func TestCPUUrgencyRisesNearDeadline(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-a", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-b", Type: api.Write, Assignee: "cpu-1"},
	)
	if u := st.cpuUrgency("cpu-1", st.Phase.StartedAt); u != 0 {
		t.Errorf("開始直後の urgency = %.2f, want 0", u)
	}
	if u := st.cpuUrgency("cpu-1", st.Phase.DeadlineAt.Add(-10*time.Second)); u != 1 {
		t.Errorf("締切 10 秒前に 2 件残りの urgency = %.2f, want 1", u)
	}
}

func TestCPURestsAfterPhaseEnds(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")
	st.player("p1").Life = api.Eliminated
	st, _ = advanceCPU(t, st, t0, 20*time.Second)
	if st.Status != api.SessionStatusIntermission {
		t.Fatalf("status = %s, want intermission", st.Status)
	}
	if a := st.CPUAgents["cpu-1"]; a.Goal != cpuGoalRest {
		t.Errorf("インターミッション中の goal = %d, want rest", a.Goal)
	}
}

func TestCPUDawdlesWhenTimeIsAmple(t *testing.T) {
	st := withTasks(newCPUState(t, []string{"p1"}, []string{"cpu-1"}),
		TaskState{ID: "task-cpu", Type: api.Write, Assignee: "cpu-1"},
		TaskState{ID: "task-human", Type: api.Write, Assignee: "p1"},
	)
	st = forceReliable(st, "cpu-1")
	a := st.CPUAgents["cpu-1"]
	a.Persona.Dawdle = 1
	st.CPUAgents["cpu-1"] = a

	mid, out := advanceCPU(t, st, t0, 12*time.Second)
	if len(msgsOf[api.TaskCompletedMessage](out)) != 0 {
		t.Errorf("時間に余裕があるのにすぐ終えた")
	}
	if mid.CPUAgents["cpu-1"].Dawdle.IsZero() {
		t.Errorf("だらだらしていない: %+v", mid.CPUAgents["cpu-1"])
	}
	_, out = advanceCPU(t, mid, t0.Add(12*time.Second), 45*time.Second)
	if done := msgsOf[api.TaskCompletedMessage](out); len(done) != 1 {
		t.Fatalf("締切までに終えなかった: %+v", done)
	} else if left := st.Phase.DeadlineAt.Sub(done[0].CompletedAt); left < 5*time.Second {
		t.Errorf("締切の %v 前に終えた(余裕を残すはず)", left)
	}
}

func TestCPUJumpLandsOnGround(t *testing.T) {
	st := newCPUState(t, []string{"p1"}, []string{"cpu-1"})
	p := st.player("cpu-1")
	a := st.CPUAgents["cpu-1"]
	st.cpuJump(p, &a, t0, 3, 1)
	peak, landings := 0.0, 0
	for i := 1; i <= 80; i++ {
		was := a.Air
		st.cpuPose(p, &a, 0.05, t0.Add(time.Duration(i)*50*time.Millisecond))
		peak = math.Max(peak, p.Transform.Position[1])
		if was && !a.Air {
			landings++
		}
	}
	if peak < 0.3 || peak > 1 {
		t.Errorf("跳んだ高さ = %.2f", peak)
	}
	if landings != 2 || a.Air || p.Transform.Position[1] != cpuGroundY {
		t.Errorf("2 回跳んで地面に戻っていない: landings=%d air=%v y=%v", landings, a.Air, p.Transform.Position[1])
	}
}
