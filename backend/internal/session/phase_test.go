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
	bc := outputsOf[Broadcast](out)
	m := bc[len(bc)-1].Msg.(api.PhaseStartedMessage)
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

// msgsOf は配る(Broadcast)メッセージのうち T のものを返す
func msgsOf[T any](out []Output) []T {
	var r []T
	for _, b := range outputsOf[Broadcast](out) {
		if m, ok := b.Msg.(T); ok {
			r = append(r, m)
		}
	}
	return r
}

func wantPhaseEnded(t *testing.T, out []Output, number int, eliminated []string, next api.PhaseEndedMessageNext) {
	t.Helper()
	ms := msgsOf[api.PhaseEndedMessage](out)
	if len(ms) != 1 {
		t.Fatalf("phase.ended = %+v in %+v", ms, out)
	}
	m := ms[0]
	if m.PhaseNumber != number || !slices.Equal(m.EliminatedPlayerIds, eliminated) || m.Next != next || m.EliminatedPlayerIds == nil {
		t.Errorf("phase.ended = %+v, want phase %d, eliminated %v, next %s", m, number, eliminated, next)
	}
}

func TestDeadlineEliminatesAndStartsNextPhase(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2", "p3"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p2"},
		TaskState{ID: "task-1-3", Type: api.Write, Assignee: "p3"},
	)
	deadline := st.Phase.DeadlineAt
	st = create(t, st, "p1", "new-1")
	st, _ = put(t, st, "p1")
	// p1 は在庫のファイル、p2 は作ったファイルを持ったまま、p3 は作業中のまま締切を迎える
	st = take(t, st, "p1", f1)
	st = create(t, st, "p2", "new-2")
	st, _ = step(t, st, interactIn("p3", workspaceID(3), nil, ""))

	st, out := step(t, st, Tick{Now: deadline.Add(-time.Millisecond)})
	if len(msgsOf[api.PhaseEndedMessage](out)) != 0 {
		t.Fatalf("phase ended before the deadline: %+v", out)
	}

	st, out = step(t, st, Tick{Now: deadline.Add(20 * time.Millisecond)})
	wantPhaseEnded(t, out, 1, []string{"p2", "p3"}, api.PhaseEndedMessageNextIntermission)
	// 未達の人は eliminated になり、同時に落下の演出を送る
	var fell []string
	for i, b := range outputsOf[Broadcast](out) {
		e, ok := b.Msg.(api.EffectMessage)
		if !ok {
			continue
		}
		fell = append(fell, *e.PlayerId)
		pu := outputsOf[Broadcast](out)[i-1].Msg.(api.PlayerUpdatedMessage)
		if e.Name != api.EffectMessageNameFall || pu.Player.PlayerId != *e.PlayerId || pu.Player.Life != api.Eliminated || pu.Player.HeldItem != nil {
			t.Errorf("effect %+v after %+v", e, pu)
		}
	}
	if !slices.Equal(fell, []string{"p2", "p3"}) {
		t.Errorf("fell = %v", fell)
	}
	if st.player("p1").Life != api.Alive || st.Status != api.SessionStatusIntermission || st.Phase.Status != api.PhaseStatusIntermission {
		t.Fatalf("after deadline: p1 %s, status %s, phase %s", st.player("p1").Life, st.Status, st.Phase.Status)
	}
	// 脱落者の手持ちはディレクトリへ。作業はすべて取りやめる
	if len(st.Actions) != 0 || len(workspaceUsers(st, 3)) != 0 || st.held("p2") != nil || st.held("p1") == nil {
		t.Errorf("actions = %+v, held p1 %v p2 %v", st.Actions, st.held("p1"), st.held("p2"))
	}
	if st.Snapshot(deadline).Game.Phase.Status != api.PhaseStatusIntermission {
		t.Error("snapshot phase is not intermission")
	}

	// intermission の間は操作できない
	in := interactIn("p1", directoryID, st.held("p1"), "")
	in.Now = deadline.Add(time.Second)
	_, out = step(t, st, in)
	wantRejected(t, out, "p1", directoryID, api.RejectReasonUnavailable)

	// intermission は締切から数える
	st, out = step(t, st, Tick{Now: deadline.Add(DefaultConfig.Phases.Intermission - time.Millisecond)})
	if len(msgsOf[api.PhaseStartedMessage](out)) != 0 {
		t.Fatalf("next phase started early: %+v", out)
	}
	next := deadline.Add(DefaultConfig.Phases.Intermission + 30*time.Millisecond)
	st, out = step(t, st, Tick{Now: next})
	started := msgsOf[api.PhaseStartedMessage](out)
	if len(started) != 1 || started[0].Phase.Number != 2 || !started[0].Phase.StartedAt.Equal(next) {
		t.Fatalf("phase.started = %+v", started)
	}
	// 第2フェーズは 2 × 3 人 = 6 件を、生存者の p1 にすべて配る
	if n := countBy(st.Phase.Tasks, func(t TaskState) string { return t.Assignee }); !reflect.DeepEqual(n, map[string]int{"p1": 6}) {
		t.Errorf("tasks per player = %v", n)
	}
	if st.Status != api.SessionStatusPlaying || !st.Phase.DeadlineAt.Equal(next.Add(DefaultConfig.Phases.Duration)) {
		t.Errorf("status = %s, deadline = %s", st.Status, st.Phase.DeadlineAt)
	}

	// アイテムは初期状態に戻る(在庫は 6 つとも編集前、成果物と手持ちは消える)。phase.started の前に配る
	if d := directoryOf(st); len(d.Stock) != len(directoryStock) || d.Outputs != 0 || st.held("p1") != nil || len(st.Items) != len(directoryStock) {
		t.Errorf("directory = %+v, items = %+v", d, st.Items)
	}
	bc := outputsOf[Broadcast](out)
	if _, ok := bc[0].Msg.(api.ObjectUpsertMessage); !ok {
		t.Errorf("first = %+v, want the reset directory", bc[0])
	}
	if pu := msgsOf[api.PlayerUpdatedMessage](out); len(pu) != 1 || pu[0].Player.PlayerId != "p1" || pu[0].Player.HeldItem != nil {
		t.Errorf("player.updated = %+v, want p1 empty-handed", pu)
	}
	if _, ok := bc[len(bc)-1].Msg.(api.PhaseStartedMessage); !ok {
		t.Errorf("last = %+v, want phase.started", bc[len(bc)-1])
	}
}

func TestDeadlineBeforeCompletion(t *testing.T) {
	base := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p2"},
	)
	deadline := base.Phase.DeadlineAt
	base = create(t, base, "p1", "new-1")

	t.Run("締切の直前に受け付けたら達成", func(t *testing.T) {
		in := interactIn("p1", directoryID, base.held("p1"), "")
		in.Now = deadline.Add(-time.Millisecond)
		st, out := step(t, base, in)
		wantTaskCompleted(t, out, "task-1-1", in.Now)
		_, out = step(t, st, Tick{Now: deadline})
		wantPhaseEnded(t, out, 1, []string{"p2"}, api.PhaseEndedMessageNextIntermission)
	})

	t.Run("締切の後に届いたら、Tick より先でも締切を先に処理する", func(t *testing.T) {
		in := interactIn("p1", directoryID, base.held("p1"), "")
		in.Now = deadline
		st, out := step(t, base, in)
		wantPhaseEnded(t, out, 1, []string{"p1", "p2"}, api.PhaseEndedMessageNextCompleted)
		wantNoTaskCompleted(t, out)
		if st.Result.Outcome != api.Defeat {
			t.Errorf("result = %+v", st.Result)
		}
	})
}

func TestAllDoneEndsPhaseEarly(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.ReadEdit, Assignee: "p2", TargetFileID: f1},
	)
	st = create(t, st, "p1", "new-1")
	st, out := put(t, st, "p1")
	if len(msgsOf[api.PhaseEndedMessage](out)) != 0 {
		t.Fatalf("phase ended while p2 has a task: %+v", out)
	}

	st = edit(t, st, "p2", f1)
	in := interactIn("p2", directoryID, st.held("p2"), "")
	in.Now = t0.Add(5 * time.Second)
	st, out = step(t, st, in)
	wantTaskCompleted(t, out, "task-1-2", in.Now)
	wantPhaseEnded(t, out, 1, []string{}, api.PhaseEndedMessageNextIntermission)
	if len(msgsOf[api.EffectMessage](out)) != 0 || !st.Phase.EndedAt.Equal(in.Now) {
		t.Errorf("effects = %+v, endedAt = %s", msgsOf[api.EffectMessage](out), st.Phase.EndedAt)
	}

	// intermission は全員が完了した時刻から数える
	st, out = step(t, st, Tick{Now: in.Now.Add(DefaultConfig.Phases.Intermission - time.Millisecond)})
	if len(out) != 0 {
		t.Errorf("out = %+v during intermission", out)
	}
	_, out = step(t, st, Tick{Now: in.Now.Add(DefaultConfig.Phases.Intermission)})
	if len(msgsOf[api.PhaseStartedMessage](out)) != 1 {
		t.Errorf("out = %+v, want phase 2", out)
	}
}

func TestAllEliminatedIsDefeat(t *testing.T) {
	st := playing(t, "p1", "p2")
	deadline := st.Phase.DeadlineAt

	st, out := step(t, st, Tick{Now: deadline.Add(10 * time.Millisecond)})
	wantPhaseEnded(t, out, 1, []string{"p1", "p2"}, api.PhaseEndedMessageNextCompleted)
	fin := msgsOf[api.SessionFinishedMessage](out)
	if len(fin) != 1 || fin[0].Result.Outcome != api.Defeat || !fin[0].Result.DecidedAt.Equal(deadline) {
		t.Fatalf("session.finished = %+v", fin)
	}
	// 結果を送ってからセッションを終える
	if e, ok := out[len(out)-1].(End); !ok || e.Reason != ReasonFinished {
		t.Errorf("last = %+v, want End(finished)", out[len(out)-1])
	}
	if fin[0].Seq != msgsOf[api.PhaseEndedMessage](out)[0].Seq+1 {
		t.Errorf("seq = %d", fin[0].Seq)
	}
	snap := st.Snapshot(deadline)
	if snap.Status != api.SessionStatusFinished || snap.Game.Result == nil || snap.Game.Result.Outcome != api.Defeat || snap.Game.Phase.Status != api.PhaseStatusCompleted {
		t.Errorf("snapshot = %s, %+v, %+v", snap.Status, snap.Game.Result, snap.Game.Phase)
	}
	if _, out = step(t, st, Tick{Now: deadline.Add(time.Hour)}); len(out) != 0 {
		t.Errorf("ended session produced %+v", out)
	}
}

func TestLastPhaseIsVictory(t *testing.T) {
	last := func(t *testing.T) State {
		t.Helper()
		st := playing(t, "p1", "p2")
		st.Phases.Count = 1
		return withTasks(st,
			TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
			TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p2"},
		)
	}

	t.Run("締切で生存者が残れば victory", func(t *testing.T) {
		st := create(t, last(t), "p1", "new-1")
		st, _ = put(t, st, "p1")
		st, out := step(t, st, Tick{Now: st.Phase.DeadlineAt})
		wantPhaseEnded(t, out, 1, []string{"p2"}, api.PhaseEndedMessageNextCompleted)
		if fin := msgsOf[api.SessionFinishedMessage](out); len(fin) != 1 || fin[0].Result.Outcome != api.Victory {
			t.Errorf("session.finished = %+v", fin)
		}
		if !st.Ended || st.Status != api.SessionStatusFinished {
			t.Errorf("ended = %v, status = %s", st.Ended, st.Status)
		}
	})

	t.Run("全員が締切前に完了しても victory", func(t *testing.T) {
		st := create(t, last(t), "p1", "new-1")
		st = create(t, st, "p2", "new-2")
		st, _ = put(t, st, "p1")
		st, out := put(t, st, "p2")
		wantPhaseEnded(t, out, 1, []string{}, api.PhaseEndedMessageNextCompleted)
		if fin := msgsOf[api.SessionFinishedMessage](out); len(fin) != 1 || fin[0].Result.Outcome != api.Victory || !fin[0].Result.DecidedAt.Equal(t0) {
			t.Errorf("session.finished = %+v", fin)
		}
		if !st.Ended {
			t.Error("session did not end")
		}
	})
}

func TestDisconnectedPlayerIsEliminatedAtDeadline(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p2"},
	)
	st = create(t, st, "p1", "new-1")
	st, _ = put(t, st, "p1")
	st, _ = step(t, st, Disconnect{PlayerID: "p2", ConnID: 2, Now: t0})

	// 切断中も life は保つが、締切で未達なら脱落する
	st, out := step(t, st, Tick{Now: st.Phase.DeadlineAt})
	wantPhaseEnded(t, out, 1, []string{"p2"}, api.PhaseEndedMessageNextIntermission)
	if p := st.player("p2"); p.Life != api.Eliminated || p.Connection != api.Disconnected {
		t.Errorf("p2 = %+v", *p)
	}
}
