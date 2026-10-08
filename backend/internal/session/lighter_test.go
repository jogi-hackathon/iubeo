package session

import (
	"slices"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// lastPhase は 1 フェーズだけのセッションで、p1・p2 が担当を終え、p3 が未達の状態を返す
func lastPhase(t *testing.T) State {
	t.Helper()
	st := newState("p1", "p2", "p3")
	st.Phases.Count = 1
	for i, p := range []string{"p1", "p2", "p3"} {
		st, _ = step(t, st, Connect{PlayerID: p, ConnID: uint64(i + 1), Now: t0})
	}
	st = withTasks(st,
		TaskState{ID: "task-1-1", Type: api.Write, Assignee: "p1"},
		TaskState{ID: "task-1-2", Type: api.Write, Assignee: "p2"},
		TaskState{ID: "task-1-3", Type: api.Write, Assignee: "p3"},
	)
	for _, p := range []string{"p1", "p2"} {
		st = create(t, st, p, "new-"+p)
		st, _ = put(t, st, p)
	}
	return st
}

// survived は lastPhase を締切まで進め、bypassPermission が立った状態を返す
func survived(t *testing.T) State {
	t.Helper()
	st := lastPhase(t)
	st, _ = step(t, st, Tick{Now: st.Phase.DeadlineAt})
	return st
}

func interactAt(in ClientInteract, now time.Time) ClientInteract {
	in.Now = now
	return in
}

func standOf(st State, seat int) api.GameObject {
	return st.gameObject(*st.object(lighterStandID(seat)))
}

func TestSurvivingLastPhaseSetsBypass(t *testing.T) {
	st := lastPhase(t)
	deadline := st.Phase.DeadlineAt

	st, out := step(t, st, Tick{Now: deadline})
	wantPhaseEnded(t, out, 1, []string{"p3"}, api.PhaseEndedMessageNextCompleted)
	// 決着はまだつけず、bypassPermission を立てる
	if len(msgsOf[api.SessionFinishedMessage](out)) != 0 || len(outputsOf[End](out)) != 0 || st.Ended {
		t.Fatalf("finished on survival: %+v", out)
	}
	tu := msgsOf[api.TeamUpdatedMessage](out)
	if len(tu) != 1 || !tu[0].Team.BypassPermission || tu[0].Team.FireStarted || tu[0].Seq != msgsOf[api.PhaseEndedMessage](out)[0].Seq+1 {
		t.Errorf("team.updated = %+v", tu)
	}
	// 生存者のライターの置き場だけが使えるようになる
	var opened []string
	for _, m := range msgsOf[api.ObjectUpsertMessage](out) {
		if m.Object.Kind == api.LighterStand && m.Object.Availability == api.ObjectAvailabilityAvailable {
			opened = append(opened, m.Object.Id)
		}
	}
	if !slices.Equal(opened, []string{lighterStandID(1), lighterStandID(2)}) || standOf(st, 3).Availability != api.ObjectAvailabilityUnavailable {
		t.Errorf("opened stands = %v, stand 3 = %+v", opened, standOf(st, 3))
	}
	snap := st.Snapshot(deadline)
	if snap.Status != api.SessionStatusPlaying || snap.Game.Phase.Status != api.PhaseStatusCompleted || !snap.Game.Team.BypassPermission || snap.Game.Result != nil {
		t.Errorf("snapshot = %s, phase %s, team %+v, result %+v", snap.Status, snap.Game.Phase.Status, snap.Game.Team, snap.Game.Result)
	}
}

func TestAllDoneInLastPhaseSetsBypass(t *testing.T) {
	st := lastPhase(t)
	st = create(t, st, "p3", "new-p3")
	in := interactAt(interactIn("p3", directoryID, st.held("p3"), ""), t0.Add(3*time.Second))
	st, out := step(t, st, in)
	wantPhaseEnded(t, out, 1, []string{}, api.PhaseEndedMessageNextCompleted)
	if !st.Team.BypassPermission || !st.BypassAt.Equal(in.Now) || st.Ended {
		t.Errorf("team = %+v, bypassAt = %s, ended = %v", st.Team, st.BypassAt, st.Ended)
	}
}

func TestLighterStand(t *testing.T) {
	stand := lighterStandID(1)

	// bypassPermission が立つまでは使えない
	_, out := step(t, lastPhase(t), interactIn("p1", stand, nil, ""))
	wantRejected(t, out, "p1", stand, api.RejectReasonUnavailable)

	st := survived(t)
	now := st.BypassAt
	_, out = step(t, st, interactAt(interactIn("p1", lighterStandID(2), nil, ""), now))
	wantRejected(t, out, "p1", lighterStandID(2), api.RejectReasonNotOwner)
	// 脱落した人は使えない
	_, out = step(t, st, interactAt(interactIn("p3", lighterStandID(3), nil, ""), now))
	wantRejected(t, out, "p3", lighterStandID(3), api.RejectReasonUnavailable)

	// 手ぶらで触れれば持つ
	st, out = step(t, st, interactAt(interactIn("p1", stand, nil, ""), now))
	bc := outputsOf[Broadcast](out)
	if len(bc) != 2 {
		t.Fatalf("take: out = %+v", out)
	}
	if up := bc[0].Msg.(api.ObjectUpsertMessage); up.Object.Id != stand || up.Object.Data != (api.LighterStandData{HasLighter: false}) {
		t.Errorf("object.upsert = %+v", up)
	}
	if pu := bc[1].Msg.(api.PlayerUpdatedMessage); pu.Player.HeldItem == nil || pu.Player.HeldItem.Id != lighterID(1) || pu.Player.HeldItem.Kind != api.Lighter || pu.Player.HeldItem.Data != nil {
		t.Errorf("player.updated = %+v", pu)
	}

	// ライターを持ってワークスペースに触れても使えない
	_, out = step(t, st, interactAt(interactIn("p1", workspaceID(1), st.held("p1"), ""), now))
	wantRejected(t, out, "p1", workspaceID(1), api.RejectReasonMissingItem)

	// ライターを持って触れれば戻す
	st, out = step(t, st, interactAt(interactIn("p1", stand, st.held("p1"), ""), now))
	if len(outputsOf[Broadcast](out)) != 2 || st.held("p1") != nil || standOf(st, 1).Data != (api.LighterStandData{HasLighter: true}) {
		t.Errorf("return: out = %+v", out)
	}

	// ファイルを持っていれば missing_item(ライターとファイルは同時に持てない)
	st = take(t, st, "p1", f1)
	_, out = step(t, st, interactAt(interactIn("p1", stand, st.held("p1"), ""), now))
	wantRejected(t, out, "p1", stand, api.RejectReasonMissingItem)
}

func TestFireThenVictory(t *testing.T) {
	st := survived(t)
	bypassAt := st.BypassAt
	fireAt := bypassAt.Add(25 * time.Second)
	st, _ = step(t, st, interactAt(interactIn("p1", lighterStandID(1), nil, ""), fireAt))
	st, _ = step(t, st, interactAt(interactIn("p2", lighterStandID(2), nil, ""), fireAt))
	stock := stockIDs(st)

	st, out := step(t, st, interactAt(interactIn("p1", directoryID, st.held("p1"), ""), fireAt))
	tu := msgsOf[api.TeamUpdatedMessage](out)
	if len(tu) != 1 || !tu[0].Team.FireStarted || !tu[0].Team.BypassPermission {
		t.Fatalf("team.updated = %+v in %+v", tu, out)
	}
	fx := msgsOf[api.EffectMessage](out)
	if len(fx) != 1 || fx[0].Name != api.EffectMessageNameFire || *fx[0].PlayerId != "p1" || *fx[0].ObjectId != directoryID {
		t.Errorf("effect = %+v", fx)
	}
	// 燃やすのは演出なので、ファイルは消さない。ライターも持ったまま
	if !slices.Equal(stockIDs(st), stock) || st.held("p1") == nil || st.held("p1").Kind != api.Lighter {
		t.Errorf("stock = %v, held = %+v", stockIDs(st), st.held("p1"))
	}

	// 2 人目からは拒否する
	_, out = step(t, st, interactAt(interactIn("p2", directoryID, st.held("p2"), ""), fireAt))
	wantRejected(t, out, "p2", directoryID, api.RejectReasonUnavailable)

	// 火をつけたら、bypass の時間切れは来ない。演出の時間(10 秒)の後に victory
	st, out = step(t, st, Tick{Now: bypassAt.Add(DefaultConfig.Phases.Bypass)})
	if len(out) != 0 {
		t.Fatalf("out = %+v at the bypass timeout after the fire", out)
	}
	st, out = step(t, st, Tick{Now: fireAt.Add(DefaultConfig.Phases.Fire - time.Millisecond)})
	if len(out) != 0 {
		t.Fatalf("out = %+v before the fire ends", out)
	}
	end := fireAt.Add(DefaultConfig.Phases.Fire)
	st, out = step(t, st, Tick{Now: end.Add(20 * time.Millisecond)})
	fin := msgsOf[api.SessionFinishedMessage](out)
	if len(fin) != 1 || fin[0].Result.Outcome != api.Victory || !fin[0].Result.DecidedAt.Equal(end) {
		t.Fatalf("session.finished = %+v", fin)
	}
	if e := outputsOf[End](out); len(e) != 1 || e[0].Reason != ReasonFinished || !st.Ended {
		t.Errorf("out = %+v, want End(finished)", out)
	}
	if snap := st.Snapshot(end); !snap.Game.Team.FireStarted || snap.Game.Result == nil || snap.Game.Result.Outcome != api.Victory {
		t.Errorf("snapshot game = %+v", snap.Game)
	}
}

func TestBypassTimesOutToVictory(t *testing.T) {
	st := survived(t)
	timeout := st.BypassAt.Add(DefaultConfig.Phases.Bypass)

	st, out := step(t, st, Tick{Now: timeout.Add(-time.Millisecond)})
	if len(out) != 0 {
		t.Fatalf("out = %+v before the timeout", out)
	}
	// 誰も火をつけないまま時間切れでも victory(火はつかないまま)
	st, out = step(t, st, Tick{Now: timeout})
	fin := msgsOf[api.SessionFinishedMessage](out)
	if len(fin) != 1 || fin[0].Result.Outcome != api.Victory || !fin[0].Result.DecidedAt.Equal(timeout) {
		t.Fatalf("session.finished = %+v", fin)
	}
	if !st.Ended || st.Team.FireStarted || len(msgsOf[api.EffectMessage](out)) != 0 {
		t.Errorf("ended = %v, team = %+v", st.Ended, st.Team)
	}
}

func TestDisconnectReturnsLighter(t *testing.T) {
	st := survived(t)
	now := st.BypassAt
	st, _ = step(t, st, interactAt(interactIn("p1", lighterStandID(1), nil, ""), now))

	st, out := step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: now})
	ups := msgsOf[api.ObjectUpsertMessage](out)
	if len(ups) != 1 || ups[0].Object.Id != lighterStandID(1) || ups[0].Object.Data != (api.LighterStandData{HasLighter: true}) {
		t.Errorf("object.upsert = %+v", ups)
	}
	if st.held("p1") != nil {
		t.Errorf("held = %+v after disconnect", st.held("p1"))
	}
}
