package session

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

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
	if ph.Number != 1 || ph.Status != api.PhaseStatusActive || !ph.StartedAt.Equal(t0) || !ph.DeadlineAt.Equal(t0.Add(time.Minute)) {
		t.Fatalf("phase = %+v", ph)
	}
	if n := countBy(ph.Tasks, func(t TaskState) string { return t.Assignee }); !reflect.DeepEqual(n, map[string]int{"p1": 1, "p2": 1, "p3": 1}) {
		t.Errorf("tasks per player = %v", n)
	}
	for _, task := range ph.Tasks {
		switch task.Type {
		case api.ReadEdit:
			if !slices.Contains(stockIDs(st), task.TargetFileID) {
				t.Errorf("read_edit target %q is not in stock", task.TargetFileID)
			}
		case api.Write, api.WebSearch, api.ImageGeneration:
			if task.TargetFileID != "" {
				t.Errorf("%s has a target: %+v", task.Type, task)
			}
		default:
			t.Errorf("type = %s, want read_edit, write, web_search or image_generation", task.Type)
		}
	}

	snap := st.Snapshot(t0)
	if snap.Game.Phase == nil || snap.Game.Phase.Number != 1 || len(snap.Game.Phase.Tasks) != 3 {
		t.Fatalf("snapshot phase = %+v", snap.Game.Phase)
	}
	for _, task := range snap.Game.Phase.Tasks {
		if task.Status != api.TaskStatusPending || task.CompletedAt != nil || (task.Type == api.ReadEdit) == (task.TargetFileId == nil) {
			t.Errorf("snapshot task = %+v", task)
		}
	}
}

func startPhaseWith(t *testing.T, seed uint64, number int) (State, []Output) {
	t.Helper()
	st := NewMultiplayerState("sess-1", []string{"p1", "p2", "p3"}, nil, t0, Timeouts{Start: time.Minute, Abandon: time.Minute}, DefaultConfig.Phases, seed)
	st.player("p3").Life = api.Eliminated
	out := st.startPhase(number, t0)
	return st, out
}

func TestPhaseRedistributesToSurvivors(t *testing.T) {
	st, out := startPhaseWith(t, 1, 2)
	if n := countBy(st.Phase.Tasks, func(t TaskState) string { return t.Assignee }); !reflect.DeepEqual(n, map[string]int{"p1": 3, "p2": 3}) {
		t.Errorf("phase 2: tasks per player = %v", n)
	}
	bc := outputsOf[Broadcast](out)
	m := bc[len(bc)-1].Msg.(api.PhaseStartedMessage)
	if m.Phase.Number != 2 || len(m.Phase.Tasks) != 6 || !m.ServerTime.Equal(t0) {
		t.Errorf("phase.started = %+v", m)
	}

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

func TestPhaseReadEditTargets(t *testing.T) {
	overlapped := false
	for seed := range uint64(200) {
		st, _ := startPhaseWith(t, seed, 3)
		targets := map[string][]string{}
		for _, task := range st.Phase.Tasks {
			if task.Type == api.ReadEdit {
				targets[task.Assignee] = append(targets[task.Assignee], task.TargetFileID)
			}
		}
		for p, ids := range targets {
			if len(slices.Compact(slices.Sorted(slices.Values(ids)))) != len(ids) || len(ids) > len(directoryStock) {
				t.Fatalf("seed %d: %s's read_edit targets = %v", seed, p, ids)
			}
			for _, id := range ids {
				if !slices.Contains(stockIDs(st), id) {
					t.Fatalf("seed %d: target %q is not in stock", seed, id)
				}
			}
		}
		if slices.ContainsFunc(targets["p1"], func(id string) bool { return slices.Contains(targets["p2"], id) }) {
			overlapped = true
		}
	}
	if !overlapped {
		t.Error("read_edit targets never overlapped between players")
	}
}

func TestPhaseReadEditPerPlayerCap(t *testing.T) {
	capped := false
	for seed := range uint64(200) {
		st := NewMultiplayerState("sess-1", []string{"p1", "p2", "p3"}, nil, t0, Timeouts{Start: time.Minute, Abandon: time.Minute}, DefaultConfig.Phases, seed)
		st.player("p2").Life = api.Eliminated
		st.player("p3").Life = api.Eliminated
		st.startPhase(3, t0)
		n := countBy(st.Phase.Tasks, func(t TaskState) string { return string(t.Type) })
		if n[string(api.ReadEdit)]+n[string(api.Write)]+n[string(api.WebSearch)]+n[string(api.ImageGeneration)] != 9 || n[string(api.ReadEdit)] > len(directoryStock) {
			t.Fatalf("seed %d: tasks = %v", seed, n)
		}
		if n[string(api.ReadEdit)] == len(directoryStock) {
			capped = true
		}
	}
	if !capped {
		t.Error("no seed used up the stock")
	}
}

func TestPhaseTaskTypesAreEven(t *testing.T) {
	n := map[api.TaskType]int{}
	for seed := range uint64(3000) {
		st := NewMultiplayerState("sess-1", []string{"p1", "p2", "p3"}, nil, t0, Timeouts{Start: time.Minute, Abandon: time.Minute}, DefaultConfig.Phases, seed)
		st.startPhase(1, t0)
		for _, task := range st.Phase.Tasks {
			n[task.Type]++
		}
	}
	if len(n) != 4 {
		t.Fatalf("types = %v, want read_edit, write, web_search and image_generation", n)
	}
	for typ, c := range n {
		if c < 2000 || c > 2500 {
			t.Errorf("types = %v, %s is not about a quarter", n, typ)
		}
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

func edit(t *testing.T, st State, player, fileID string) State {
	t.Helper()
	st = take(t, st, player, fileID)
	st, _ = step(t, st, interactIn(player, workspaceID(st.player(player).Seat), st.held(player), ""))
	st, _ = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
	return st
}

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

	st = take(t, st, "p1", f1)
	st, out := put(t, st, "p1")
	wantNoTaskCompleted(t, out)

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

	if it := st.item(f1); it.Status != api.FileStatusUnedited {
		t.Errorf("file = %+v, want unedited after put", it)
	}
	st = take(t, st, "p1", f1)
	st, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)
	st = edit(t, st, "p1", f1)
	_, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)
}

func TestTwoPlayersShareReadEditTarget(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.ReadEdit, Assignee: "p1", TargetFileID: f1},
		TaskState{ID: "task-1-2", Type: api.ReadEdit, Assignee: "p2", TargetFileID: f1},
	)

	st = edit(t, st, "p1", f1)
	_, out := step(t, st, interactIn("p2", directoryID, nil, f1))
	wantRejected(t, out, "p2", directoryID, api.RejectReasonNotFound)

	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-1", t0)
	if !taskOf(st, "task-1-2").CompletedAt.IsZero() {
		t.Fatal("p2's task completed by p1's file")
	}

	st = take(t, st, "p2", f1)
	st, out = put(t, st, "p2")
	wantNoTaskCompleted(t, out)

	st = edit(t, st, "p2", f1)
	_, out = put(t, st, "p2")
	wantTaskCompleted(t, out, "task-1-2", t0)
	wantPhaseEnded(t, out, 1, []string{}, api.PhaseEndedMessageNextIntermission)
}

func TestCompleteWrite(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-3", Type: api.Write, Assignee: "p2"},
	)

	st = edit(t, st, "p1", f1)
	st, out := put(t, st, "p1")
	wantNoTaskCompleted(t, out)

	st = create(t, st, "p1", "new-1")
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-1", t0)
	st = create(t, st, "p1", "new-2")
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-2", t0)

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

func paint(t *testing.T, st State, player, newID string) State {
	t.Helper()
	in := interactIn(player, canvasID(st.player(player).Seat), nil, "")
	in.NewID = newID
	st, _ = step(t, st, in)
	st, _ = step(t, st, Tick{Now: t0.Add(CanvasActionDuration)})
	return st
}

func browse(t *testing.T, st State, player, newID string) State {
	t.Helper()
	in := interactIn(player, pcID(st.player(player).Seat), nil, "")
	in.NewID = newID
	st, _ = step(t, st, in)
	st, _ = step(t, st, Tick{Now: t0.Add(PcActionDuration)})
	return st
}

func TestCompleteWebSearch(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.WebSearch, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-3", Type: api.WebSearch, Assignee: "p2"},
	)

	st = create(t, st, "p1", "new-1")
	st, out := put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-2", t0)
	if !taskOf(st, "task-1-1").CompletedAt.IsZero() {
		t.Fatal("web_search completed by a written file")
	}

	st = browse(t, st, "p1", "search-1")
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-1", t0)

	st = browse(t, st, "p1", "search-2")
	st, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)
	if !taskOf(st, "task-1-3").CompletedAt.IsZero() {
		t.Error("p2's task completed by p1's search")
	}

	st = browse(t, st, "p2", "search-3")
	st, out = put(t, st, "p2")
	wantTaskCompleted(t, out, "task-1-3", t0)
	wantPhaseEnded(t, out, 1, []string{}, api.PhaseEndedMessageNextIntermission)
	if directoryOf(st).Outputs != 4 {
		t.Errorf("outputs = %d, want 4", directoryOf(st).Outputs)
	}
}

func TestCompleteImageGeneration(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.ImageGeneration, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-3", Type: api.ImageGeneration, Assignee: "p2"},
	)

	st = create(t, st, "p1", "new-1")
	st, out := put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-2", t0)
	if !taskOf(st, "task-1-1").CompletedAt.IsZero() {
		t.Fatal("image_generation completed by a written file")
	}

	st = paint(t, st, "p1", "img-1")
	st, out = put(t, st, "p1")
	wantTaskCompleted(t, out, "task-1-1", t0)

	st = paint(t, st, "p1", "img-2")
	st, out = put(t, st, "p1")
	wantNoTaskCompleted(t, out)
	if !taskOf(st, "task-1-3").CompletedAt.IsZero() {
		t.Error("p2's task completed by p1's image")
	}

	st = paint(t, st, "p2", "img-3")
	st, out = put(t, st, "p2")
	wantTaskCompleted(t, out, "task-1-3", t0)
	wantPhaseEnded(t, out, 1, []string{}, api.PhaseEndedMessageNextIntermission)
	if directoryOf(st).Outputs != 4 {
		t.Errorf("outputs = %d, want 4", directoryOf(st).Outputs)
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

	st, out := step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
	wantNoTaskCompleted(t, out)
	st, out = step(t, st, Disconnect{PlayerID: "p2", ConnID: 2, Now: t0})
	wantNoTaskCompleted(t, out)
	if directoryOf(st).Outputs != 1 || !slices.Contains(stockIDs(st), f1) || st.item(f1).Status != api.FileStatusUnedited {
		t.Errorf("directory = %+v", directoryOf(st))
	}
	for _, task := range st.Phase.Tasks {
		if !task.CompletedAt.IsZero() {
			t.Errorf("task = %+v", task)
		}
	}

	st, _ = step(t, st, Connect{PlayerID: "p2", ConnID: 3, Now: t0})
	st = edit(t, st, "p2", f1)
	_, out = put(t, st, "p2")
	wantTaskCompleted(t, out, "task-1-2", t0)
}

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
	st = take(t, st, "p1", f1)
	st = create(t, st, "p2", "new-2")
	st, _ = step(t, st, interactIn("p3", workspaceID(3), nil, ""))

	st, out := step(t, st, Tick{Now: deadline.Add(-time.Millisecond)})
	if len(msgsOf[api.PhaseEndedMessage](out)) != 0 {
		t.Fatalf("phase ended before the deadline: %+v", out)
	}

	st, out = step(t, st, Tick{Now: deadline.Add(20 * time.Millisecond)})
	wantPhaseEnded(t, out, 1, []string{"p2", "p3"}, api.PhaseEndedMessageNextIntermission)
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
	if len(st.Actions) != 0 || len(workspaceUsers(st, 3)) != 0 || st.held("p2") != nil || st.held("p1") == nil {
		t.Errorf("actions = %+v, held p1 %v p2 %v", st.Actions, st.held("p1"), st.held("p2"))
	}
	if st.Snapshot(deadline).Game.Phase.Status != api.PhaseStatusIntermission {
		t.Error("snapshot phase is not intermission")
	}

	in := interactIn("p1", directoryID, st.held("p1"), "")
	in.Now = deadline.Add(time.Second)
	_, out = step(t, st, in)
	wantRejected(t, out, "p1", directoryID, api.RejectReasonUnavailable)

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
	if n := countBy(st.Phase.Tasks, func(t TaskState) string { return t.Assignee }); !reflect.DeepEqual(n, map[string]int{"p1": 6}) {
		t.Errorf("tasks per player = %v", n)
	}
	if st.Status != api.SessionStatusPlaying || !st.Phase.DeadlineAt.Equal(next.Add(DefaultConfig.Phases.Duration)) {
		t.Errorf("status = %s, deadline = %s", st.Status, st.Phase.DeadlineAt)
	}

	if d := directoryOf(st); len(d.Stock) != len(directoryStock) || d.Outputs != 0 || st.held("p1") != nil || len(st.Items) != len(directoryStock)+3 {
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

func TestDisconnectedPlayerIsEliminatedAtDeadline(t *testing.T) {
	st := withTasks(playing(t, "p1", "p2"),
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p2"},
	)
	st = create(t, st, "p1", "new-1")
	st, _ = put(t, st, "p1")
	st, _ = step(t, st, Disconnect{PlayerID: "p2", ConnID: 2, Now: t0})

	st, out := step(t, st, Tick{Now: st.Phase.DeadlineAt})
	wantPhaseEnded(t, out, 1, []string{"p2"}, api.PhaseEndedMessageNextIntermission)
	if p := st.player("p2"); p.Life != api.Eliminated || p.Connection != api.Disconnected {
		t.Errorf("p2 = %+v", *p)
	}
}
