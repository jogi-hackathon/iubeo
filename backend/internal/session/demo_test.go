package session

import (
	"reflect"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

func TestParseDemoTasks(t *testing.T) {
	got, err := ParseDemoTasks(" write ; web_search:名古屋 グルメ, image_generation ;read_edit,read_edit")
	if err != nil {
		t.Fatal(err)
	}
	want := [][]DemoTask{
		{{Type: api.Write}},
		{{Type: api.WebSearch, Topic: "名古屋 グルメ"}, {Type: api.ImageGeneration}},
		{{Type: api.ReadEdit}, {Type: api.ReadEdit}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v, want %+v", got, want)
	}

	if got, err := ParseDemoTasks("  "); err != nil || got != nil {
		t.Errorf("empty = %+v, %v, want nil", got, err)
	}
	for _, bad := range []string{"draw", "write;;read_edit", "write:お題", "web_search:", "write,"} {
		if _, err := ParseDemoTasks(bad); err == nil {
			t.Errorf("%q: want an error", bad)
		}
	}
}

func demoPlaying(t *testing.T, demo [][]DemoTask, players ...string) State {
	t.Helper()
	rules := DefaultConfig.Phases
	rules.Demo = demo
	st := NewMultiplayerState("sess-1", players, nil, t0, Timeouts{Start: time.Minute, Abandon: time.Minute}, rules, 1)
	for i, p := range players {
		st, _ = step(t, st, Connect{PlayerID: p, ConnID: uint64(i + 1), Now: t0})
	}
	return st
}

func TestDemoTasksGoToEveryone(t *testing.T) {
	demo := [][]DemoTask{{{Type: api.WebSearch, Topic: "名古屋 グルメ"}, {Type: api.Write}}}
	st := demoPlaying(t, demo, "p1", "p2", "p3")

	want := []TaskState{}
	for _, p := range []string{"p1", "p2", "p3"} {
		want = append(want,
			TaskState{Type: api.WebSearch, Assignee: p, Topic: "名古屋 グルメ"},
			TaskState{Type: api.Write, Assignee: p},
		)
	}
	got := st.Phase.Tasks
	if len(got) != len(want) {
		t.Fatalf("tasks = %+v", got)
	}
	for i := range got {
		if got[i].ID != taskID(1, i+1) {
			t.Errorf("task %d id = %s", i, got[i].ID)
		}
		got[i].ID = ""
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("tasks = %+v, want %+v", got, want)
	}
}

func TestDemoReadEditIsContested(t *testing.T) {
	st := demoPlaying(t, [][]DemoTask{{{Type: api.ReadEdit}, {Type: api.ReadEdit}}}, "p1", "p2")
	stock := stockIDs(st)
	for _, task := range st.Phase.Tasks {
		if task.Type != api.ReadEdit {
			t.Fatalf("task = %+v", task)
		}
	}
	targets := []string{}
	for _, task := range st.Phase.Tasks {
		targets = append(targets, task.TargetFileID)
	}
	if want := []string{stock[0], stock[1], stock[0], stock[1]}; !reflect.DeepEqual(targets, want) {
		t.Errorf("targets = %v, want %v", targets, want)
	}
}

func TestDemoReadEditFallsBackToWriteWithoutStock(t *testing.T) {
	st := demoPlaying(t, nil, "p1")
	tasks := st.demoTasks(1, []DemoTask{{Type: api.ReadEdit}}, []string{"p1"})
	if tasks[0].TargetFileID == "" {
		t.Fatalf("task = %+v", tasks[0])
	}
	for i := range st.Items {
		st.Items[i].Location = Location{Kind: HeldBy, ObjectID: "p1"}
	}
	tasks = st.demoTasks(1, []DemoTask{{Type: api.ReadEdit}}, []string{"p1"})
	if tasks[0].Type != api.Write || tasks[0].TargetFileID != "" {
		t.Errorf("task = %+v, want write", tasks[0])
	}
}

func TestDemoSkipsEliminatedAndDrawsAfterScript(t *testing.T) {
	st := demoPlaying(t, [][]DemoTask{{{Type: api.Write}}, {{Type: api.ImageGeneration}}}, "p1", "p2", "p3")
	st.player("p3").Life = api.Eliminated

	st.startPhase(2, t0)
	if len(st.Phase.Tasks) != 2 || st.Phase.Tasks[0].Assignee != "p1" || st.Phase.Tasks[1].Assignee != "p2" {
		t.Fatalf("phase 2 tasks = %+v", st.Phase.Tasks)
	}
	for _, task := range st.Phase.Tasks {
		if task.Type != api.ImageGeneration {
			t.Errorf("task = %+v", task)
		}
	}

	st.startPhase(3, t0)
	if len(st.Phase.Tasks) != tasksPerPlayer(3)*len(st.Players) {
		t.Errorf("phase 3 is not drawn as usual: %+v", st.Phase.Tasks)
	}
}
