package session

import (
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// newCPUState は、人間 + CPU のセッションを playing まで進める(CPU は接続しない)
func newCPUState(t *testing.T, humans, cpus []string) State {
	t.Helper()
	st := NewMultiplayerState("sess-1", humans, cpus, t0, Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, DefaultConfig.Phases, 1)
	for i, p := range humans {
		st, _ = step(t, st, Connect{PlayerID: p, ConnID: uint64(i + 1), Now: t0})
	}
	if st.Status != api.SessionStatusPlaying {
		t.Fatalf("status = %s, want playing(CPU の接続を待たない)", st.Status)
	}
	return st
}

// forceReliable は、テストを決定的にするため、CPU の成功率を 1 にする(失敗を選ばせない)
func forceReliable(st State, ids ...string) State {
	for _, id := range ids {
		a := st.CpuAgents[id]
		a.Reliability = 1
		st.CpuAgents[id] = a
	}
	return st
}

// advanceCPU は start から d の間、50ms 刻みで Tick を進める(移動と作業を実際に進めるため)
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
	// ノルマは人数分(フェーズ 1 × 3 人)
	if len(st.Phase.Tasks) != 3 {
		t.Errorf("tasks = %d, want 3", len(st.Phase.Tasks))
	}
	// CPU は席のスポーンに立っている(位置を配る側になった)
	if cpu.Transform.Position == nil || !cpu.reported {
		t.Errorf("cpu-1 transform = %+v, want reported at spawn", cpu.Transform)
	}
}

func TestCPUAssignsPersonas(t *testing.T) {
	st := newCPUState(t, []string{"p1"}, []string{"cpu-1", "cpu-2"})
	p1, ok1 := st.CpuPersonas["cpu-1"]
	p2, ok2 := st.CpuPersonas["cpu-2"]
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
	// 対象のファイルは、山に戻っている(持ち物は編集済みのまま残らない)
	it := st.item(f1)
	if it == nil || it.Location.Kind != InDirectory {
		t.Errorf("file = %+v, want back in directory", it)
	}
	// 歩いている: 位置がスポーンから動き、transforms が配られている
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
	// 取りに行く途中で待っている(手ぶら)
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
	// bypass(30s)の時間切れで victory になる前に、フェーズが完了するところまで進める
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

	// CPU だけ先に終わらせて、人間は締切で脱落させる
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

	// 火をつける人が居ないので、bypass の時間切れで victory
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
