package session

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// withTasks はフェーズのタスクを決めたものに差し替える(分配は乱数なので、達成のテストでは固定する)
func withTasks(st State, tasks ...TaskState) State {
	st = st.clone()
	st.Phase.Tasks = tasks
	return st
}

func taskOf(st State, id string) TaskState {
	i := slices.IndexFunc(st.Phase.Tasks, func(t TaskState) bool { return t.ID == id })
	return st.Phase.Tasks[i]
}

func countBy(tasks []TaskState, key func(TaskState) string) map[string]int {
	m := map[string]int{}
	for _, t := range tasks {
		m[key(t)]++
	}
	return m
}

func TestFirstPhaseStarts(t *testing.T) {
	st := playing(t, "p1", "p2", "p3")

	ph := st.Phase
	if ph.Number != 1 || ph.Status != api.PhaseStatusActive || !ph.StartedAt.Equal(t0) || !ph.DeadlineAt.Equal(t0.Add(30*time.Second)) {
		t.Fatalf("phase = %+v", ph)
	}
	// 第1フェーズは 1 × 3 人 = 3 件。生存者 3 人で 1 件ずつ
	if n := countBy(ph.Tasks, func(t TaskState) string { return t.Assignee }); !reflect.DeepEqual(n, map[string]int{"p1": 1, "p2": 1, "p3": 1}) {
		t.Errorf("tasks per player = %v", n)
	}
	for _, task := range ph.Tasks {
		switch task.Type {
		case api.ReadEdit:
			if !slices.Contains(stockIDs(st), task.TargetFileID) {
				t.Errorf("read_edit target %q is not in stock", task.TargetFileID)
			}
		case api.Write:
			if task.TargetFileID != "" {
				t.Errorf("write has a target: %+v", task)
			}
		default:
			t.Errorf("type = %s, want read_edit or write", task.Type)
		}
	}

	snap := st.Snapshot(t0)
	if snap.Game.Phase == nil || snap.Game.Phase.Number != 1 || len(snap.Game.Phase.Tasks) != 3 {
		t.Fatalf("snapshot phase = %+v", snap.Game.Phase)
	}
	for _, task := range snap.Game.Phase.Tasks {
		if task.Status != api.TaskStatusPending || task.CompletedAt != nil || (task.Type == api.Write) != (task.TargetFileId == nil) {
			t.Errorf("snapshot task = %+v", task)
		}
	}
}

// startPhaseWith は p3 を脱落させて第 number フェーズを始める
func startPhaseWith(t *testing.T, seed uint64, number int) (State, []Output) {
	t.Helper()
	st := NewMultiplayerState("sess-1", []string{"p1", "p2", "p3"}, t0, Timeouts{Start: time.Minute, Abandon: time.Minute}, DefaultConfig.Phases, seed)
	st.player("p3").Life = api.Eliminated
	out := st.startPhase(number, t0)
	return st, out
}

func TestPhaseRedistributesToSurvivors(t *testing.T) {
	// 第2フェーズは 2 × 3 人 = 6 件。生存者 2 人で割り切れる
	st, out := startPhaseWith(t, 1, 2)
	if n := countBy(st.Phase.Tasks, func(t TaskState) string { return t.Assignee }); !reflect.DeepEqual(n, map[string]int{"p1": 3, "p2": 3}) {
		t.Errorf("phase 2: tasks per player = %v", n)
	}
	m := outputsOf[Broadcast](out)[0].Msg.(api.PhaseStartedMessage)
	if m.Phase.Number != 2 || len(m.Phase.Tasks) != 6 || !m.ServerTime.Equal(t0) {
		t.Errorf("phase.started = %+v", m)
	}

	// 第3フェーズは 9 件。4 件ずつで、端数の 1 件は乱数で誰かに足す
	extra := map[string]bool{}
	for seed := range uint64(50) {
		st, _ := startPhaseWith(t, seed, 3)
		n := countBy(st.Phase.Tasks, func(t TaskState) string { return t.Assignee })
		if n["p1"]+n["p2"] != 9 || n["p3"] != 0 || min(n["p1"], n["p2"]) != 4 {
			t.Fatalf("seed %d: tasks per player = %v", seed, n)
		}
		if n["p1"] == 5 {
			extra["p1"] = true
		} else {
			extra["p2"] = true
		}
	}
	if !extra["p1"] || !extra["p2"] {
		t.Errorf("remainder always went to the same player: %v", extra)
	}
}

func TestPhaseReadEditDoesNotExceedStock(t *testing.T) {
	capped := false
	for seed := range uint64(200) {
		st, _ := startPhaseWith(t, seed, 3)
		var targets []string
		for _, task := range st.Phase.Tasks {
			if task.Type == api.ReadEdit {
				targets = append(targets, task.TargetFileID)
			}
		}
		slices.Sort(targets)
		if len(slices.Compact(slices.Clone(targets))) != len(targets) {
			t.Fatalf("seed %d: read_edit targets overlap: %v", seed, targets)
		}
		// 在庫は 6 つ。それを超える分は write になる
		if len(targets) > len(directoryStock) {
			t.Fatalf("seed %d: %d read_edit tasks for %d files", seed, len(targets), len(directoryStock))
		}
		if len(targets) == len(directoryStock) {
			capped = true
		}
	}
	if !capped {
		t.Error("no seed used up the stock")
	}
}

func TestPhaseIsDeterministicForSeed(t *testing.T) {
	a, _ := startPhaseWith(t, 7, 3)
	b, _ := startPhaseWith(t, 7, 3)
	if !reflect.DeepEqual(a.Phase.Tasks, b.Phase.Tasks) {
		t.Errorf("same seed gave different tasks:\n%+v\n%+v", a.Phase.Tasks, b.Phase.Tasks)
	}
}

func wantTaskCompleted(t *testing.T, out []Output, taskID string, at time.Time) {
	t.Helper()
	for _, b := range outputsOf[Broadcast](out) {
		if m, ok := b.Msg.(api.TaskCompletedMessage); ok {
			if m.TaskId != taskID || !m.CompletedAt.Equal(at) {
				t.Errorf("task.completed = %+v, want %s at %s", m, taskID, at)
			}
			return
		}
	}
	t.Errorf("no task.completed in %+v", out)
}

func wantNoTaskCompleted(t *testing.T, out []Output) {
	t.Helper()
	for _, b := range outputsOf[Broadcast](out) {
		if m, ok := b.Msg.(api.TaskCompletedMessage); ok {
			t.Errorf("unexpected task.completed %+v", m)
		}
	}
}

// edit はプレイヤーに在庫のファイルを取り出して編集させる
func edit(t *testing.T, st State, player, fileID string) State {
	t.Helper()
	st = take(t, st, player, fileID)
	st, _ = step(t, st, interactIn(player, workspaceID(st.player(player).Seat), st.held(player), ""))
	st, _ = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
	return st
}

// create はプレイヤーにワークスペースで新しいファイルを作らせる
func create(t *testing.T, st State, player, newID string) State {
	t.Helper()
	in := interactIn(player, workspaceID(st.player(player).Seat), nil, "")
	in.NewID = newID
	st, _ = step(t, st, in)
	st, _ = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
	return st
}

func TestCompleteReadEdit(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.ReadEdit, Assignee: "p1", TargetFileID: f1},
		TaskState{ID: "task-1-2", Type: api.ReadEdit, Assignee: "p2", TargetFileID: f2},
	)

	// 編集前のまま入れても達成にならない
	st = take(t, st, "p1", f1)
	st, out := put(t, st, "p1")
	wantNoTaskCompleted(t, out)

	// 他の人の対象を編集して入れても達成にならない
	st = edit(t, st, "p1", f2)
	st, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)

	st = edit(t, st, "p1", f1)
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-1", t0)
	if bc := outputsOf[Broadcast](out); len(bc) != 3 {
		t.Errorf("out = %+v, want object.upsert, player.updated, task.completed", out)
	} else if m := bc[2].Msg.(api.TaskCompletedMessage); m.Seq != bc[1].Msg.(api.PlayerUpdatedMessage).Seq+1 {
		t.Errorf("task.completed seq = %d", m.Seq)
	}
	task := st.Snapshot(t0).Game.Phase.Tasks[0]
	if task.Status != api.TaskStatusCompleted || task.CompletedAt == nil || !task.CompletedAt.Equal(t0) {
		t.Errorf("snapshot task = %+v", task)
	}

	// 取り出して入れ直しても、もう一度は数えない
	st = take(t, st, "p1", f1)
	_, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)
}

func TestCompleteWrite(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-3", Type: api.Write, Assignee: "p2"},
	)

	// 在庫のファイルを編集して入れても write にはならない
	st = edit(t, st, "p1", f1)
	st, out := put(t, st, "p1")
	wantNoTaskCompleted(t, out)

	st = create(t, st, "p1", "new-1")
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-1", t0)
	st = create(t, st, "p1", "new-2")
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-2", t0)

	// 自分の write が済んだあとに作ったファイルは、他の人の write にも数えない
	st = create(t, st, "p1", "new-3")
	st, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)
	if task := taskOf(st, "task-1-3"); !task.CompletedAt.IsZero() {
		t.Errorf("p2's task = %+v", task)
	}
	if directoryOf(st).Outputs != 3 {
		t.Errorf("outputs = %d, want 3", directoryOf(st).Outputs)
	}
}

func TestCompleteBeforeDeadlineOnly(t *testing.T) {
	st := withTasks(playing(t, "p1"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p1"},
	)
	deadline := st.Phase.DeadlineAt

	st = create(t, st, "p1", "new-1")
	in := interactIn("p1", directoryID, st.held("p1"), "")
	in.Now = deadline.Add(-time.Millisecond)
	st, out := step(t, st, in)
	wantTaskCompleted(t, out, "task-1-1", in.Now)

	// 締切ちょうどに受け付けたものは締切後
	st = create(t, st, "p1", "new-2")
	in = interactIn("p1", directoryID, st.held("p1"), "")
	in.Now = deadline
	st, out = step(t, st, in)
	wantNoTaskCompleted(t, out)
	if task := taskOf(st, "task-1-2"); !task.CompletedAt.IsZero() {
		t.Errorf("task = %+v", task)
	}
}

func TestDisconnectedFileDoesNotComplete(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.ReadEdit, Assignee: "p2", TargetFileID: f1},
	)
	st = create(t, st, "p1", "new-1")
	st = edit(t, st, "p2", f1)

	// 切断で手持ちがディレクトリに入っても、成果物・在庫にはなるが達成には数えない
	st, out := step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
	wantNoTaskCompleted(t, out)
	st, out = step(t, st, Disconnect{PlayerID: "p2", ConnID: 2, Now: t0})
	wantNoTaskCompleted(t, out)
	if directoryOf(st).Outputs != 1 || !slices.Contains(stockIDs(st), f1) {
		t.Errorf("directory = %+v", directoryOf(st))
	}
	for _, task := range st.Phase.Tasks {
		if !task.CompletedAt.IsZero() {
			t.Errorf("task = %+v", task)
		}
	}

	// 再接続して取り出し、自分で入れ直せば達成になる
	st, _ = step(t, st, Connect{PlayerID: "p2", ConnID: 3, Now: t0})
	st = take(t, st, "p2", f1)
	_, out = put(t, st, "p2")
	wantTaskCompleted(t, out, "task-1-2", t0)
}
