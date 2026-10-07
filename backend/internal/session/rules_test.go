package session

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

var t0 = time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)

func newState(players ...string) State {
	return NewMultiplayerState("sess-1", players, t0, Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, DefaultConfig.Phases, 1)
}

// step は Step を呼び、元の状態が書き換わっていないことも確かめる
func step(t *testing.T, st State, in Input) (State, []Output) {
	t.Helper()
	before := st.clone()
	next, out := Step(st, in)
	if !reflect.DeepEqual(before, st) {
		t.Fatalf("Step modified its input state")
	}
	return next, out
}

func at(d time.Duration) time.Time { return t0.Add(d) }

func outputsOf[T Output](out []Output) []T {
	var r []T
	for _, o := range out {
		if v, ok := o.(T); ok {
			r = append(r, v)
		}
	}
	return r
}

func TestInitialState(t *testing.T) {
	st := newState("p1", "p2", "p3")
	snap := st.Snapshot(t0)

	if snap.Status != api.SessionStatusWaiting || snap.Mode != api.SessionModeMultiplayer || snap.Seq != 0 || snap.SchemaVersion != api.N2 {
		t.Errorf("snapshot header = %+v", snap)
	}
	if snap.Game.Phase != nil || snap.Game.Result != nil {
		t.Errorf("game = %+v, want no phase and no result", snap.Game)
	}
	for i, p := range snap.Players {
		if p.Seat != i+1 || p.Connection != api.Connecting || p.Life != api.Alive || p.HeldItem != nil || p.Kind != api.Human {
			t.Errorf("player %d = %+v", i, p)
		}
	}

	if len(snap.Objects) != 4 {
		t.Fatalf("objects = %d, want directory + 3 workspaces", len(snap.Objects))
	}
	dir := snap.Objects[0]
	if dir.Id != "directory-1" || dir.Kind != api.Directory || dir.Scope != api.Shared || dir.Owner != nil || !slices.Equal(dir.Position, api.Vec3{14, 0, 1}) {
		t.Errorf("directory = %+v", dir)
	}
	data, ok := dir.Data.(api.DirectoryData)
	if !ok || len(data.Stock) != 6 || data.Outputs != 0 {
		t.Fatalf("directory data = %+v", dir.Data)
	}
	if data.Stock[0].Color != "#e63946" || data.Stock[0].Status != api.StockFileStatusUnedited {
		t.Errorf("stock[0] = %+v", data.Stock[0])
	}
	positions := map[string]api.Vec3{"p1": {14, 0, -5}, "p2": {11.5, 0, -5}, "p3": {16.5, 0, -5}}
	for _, ws := range snap.Objects[1:] {
		if ws.Kind != api.Workspace || ws.Scope != api.Personal || ws.Owner == nil || ws.Data != nil {
			t.Errorf("workspace = %+v", ws)
			continue
		}
		if !slices.Equal(ws.Position, positions[*ws.Owner]) {
			t.Errorf("workspace of %s at %v, want %v", *ws.Owner, ws.Position, positions[*ws.Owner])
		}
	}
}

func TestConnectStartsWhenAllHumansConnected(t *testing.T) {
	st := newState("p1", "p2")

	st, out := step(t, st, Connect{PlayerID: "p1", ConnID: 1, Now: at(time.Second)})
	if st.Status != api.SessionStatusWaiting {
		t.Fatalf("status = %s after first connect", st.Status)
	}
	bc := outputsOf[Broadcast](out)
	if len(bc) != 1 || bc[0].Except != "p1" {
		t.Fatalf("broadcasts = %+v, want player.updated to others", bc)
	}
	if m := bc[0].Msg.(api.PlayerUpdatedMessage); m.Seq != 1 || m.Player.PlayerId != "p1" || m.Player.Connection != api.Connected {
		t.Errorf("player.updated = %+v", m)
	}
	sends := outputsOf[Send](out)
	if len(sends) != 1 || sends[0].To != "p1" {
		t.Fatalf("sends = %+v, want snapshot to p1", sends)
	}
	snap := sends[0].Msg.(api.SnapshotMessage).Session
	if snap.Seq != 1 || snap.Players[0].Connection != api.Connected || snap.Status != api.SessionStatusWaiting {
		t.Errorf("snapshot = seq %d, %s, %s", snap.Seq, snap.Players[0].Connection, snap.Status)
	}

	st, out = step(t, st, Connect{PlayerID: "p2", ConnID: 2, Now: at(2 * time.Second)})
	if st.Status != api.SessionStatusPlaying || !st.StartedAt.Equal(at(2*time.Second)) {
		t.Fatalf("status = %s, startedAt = %s", st.Status, st.StartedAt)
	}
	// 本人には開始前の snapshot、その後で全員に session.started と phase.started
	if _, ok := out[len(out)-3].(Send); !ok {
		t.Errorf("snapshot should come before session.started: %+v", out)
	}
	started, ok := out[len(out)-2].(Broadcast)
	if !ok {
		t.Fatalf("output = %+v", out[len(out)-2])
	}
	if m := started.Msg.(api.SessionStartedMessage); m.Seq != 3 || !m.StartedAt.Equal(at(2*time.Second)) || started.Except != "" {
		t.Errorf("session.started = %+v", started)
	}
	last := out[len(out)-1].(Broadcast)
	if m := last.Msg.(api.PhaseStartedMessage); m.Seq != 4 || m.Phase.Number != 1 || !m.ServerTime.Equal(at(2*time.Second)) {
		t.Errorf("phase.started = %+v", last)
	}
}

func TestSecondConnectionReplacesOld(t *testing.T) {
	st := newState("p1", "p2")
	st, _ = step(t, st, Connect{PlayerID: "p1", ConnID: 1, Now: t0})

	st, out := step(t, st, Connect{PlayerID: "p1", ConnID: 5, Now: t0})
	if c := outputsOf[CloseConn](out); len(c) != 1 || c[0].ConnID != 1 || c[0].Reason != ReasonReplaced {
		t.Errorf("close = %+v, want old connection closed", c)
	}
	if len(outputsOf[Broadcast](out)) != 0 {
		t.Errorf("already connected: want no player.updated, got %+v", out)
	}
	if len(outputsOf[Send](out)) != 1 {
		t.Errorf("want snapshot to the new connection, got %+v", out)
	}

	// 置き換えられた古い接続が切れても、プレイヤーは接続したまま
	st, out = step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
	if len(out) != 0 || st.player("p1").Connection != api.Connected || st.player("p1").ConnID != 5 {
		t.Errorf("stale disconnect changed state: out=%+v player=%+v", out, *st.player("p1"))
	}
}

func TestDisconnect(t *testing.T) {
	st := newState("p1", "p2")
	st, _ = step(t, st, Connect{PlayerID: "p1", ConnID: 1, Now: t0})
	st, _ = step(t, st, Connect{PlayerID: "p2", ConnID: 2, Now: t0})
	seq := st.Seq

	st, out := step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: at(time.Second)})
	bc := outputsOf[Broadcast](out)
	if len(bc) != 1 {
		t.Fatalf("out = %+v", out)
	}
	if m := bc[0].Msg.(api.PlayerUpdatedMessage); m.Seq != seq+1 || m.Player.Connection != api.Disconnected {
		t.Errorf("player.updated = %+v", m)
	}
	if !st.AllDisconnectedAt.IsZero() {
		t.Error("AllDisconnectedAt set while p2 is connected")
	}
	st, _ = step(t, st, Disconnect{PlayerID: "p2", ConnID: 2, Now: at(2 * time.Second)})
	if !st.AllDisconnectedAt.Equal(at(2 * time.Second)) {
		t.Errorf("AllDisconnectedAt = %s", st.AllDisconnectedAt)
	}
}

func transformIn(player string, seq int64, x float64) ClientTransform {
	return ClientTransform{PlayerID: player, Msg: api.TransformMessage{
		Type: api.TransformMessageTypeTransform, Seq: seq, Position: api.Vec3{x, 0, 0}, Yaw: 1, Pitch: -0.5,
	}}
}

func TestTransforms(t *testing.T) {
	st := newState("p1", "p2")

	// 誰も動いていなければ送らない
	st, out := step(t, st, Tick{Now: at(time.Second)})
	if len(out) != 0 {
		t.Fatalf("idle tick: out = %+v", out)
	}

	// 最初の transform は seq 0 でも受け付ける。seq が増えない更新は捨てる
	st, _ = step(t, st, transformIn("p1", 0, 1))
	st, _ = step(t, st, transformIn("p1", 3, 3))
	st, _ = step(t, st, transformIn("p1", 2, 2))
	st, _ = step(t, st, transformIn("p1", 3, 4))

	st, out = step(t, st, Tick{Now: at(2 * time.Second)})
	bc := outputsOf[Broadcast](out)
	if len(bc) != 1 {
		t.Fatalf("tick: out = %+v", out)
	}
	m := bc[0].Msg.(api.TransformsMessage)
	if len(m.Players) != 1 || m.Players[0].PlayerId != "p1" || !m.ServerTime.Equal(at(2*time.Second)) {
		t.Fatalf("transforms = %+v, want only p1", m)
	}
	if tr := m.Players[0].Transform; tr.Seq != 3 || tr.Position[0] != 3 || tr.Yaw != 1 || tr.Pitch != -0.5 {
		t.Errorf("transform = %+v, want seq 3 at x=3", tr)
	}
	if st.Seq != 0 {
		t.Errorf("transforms changed seq to %d", st.Seq)
	}

	// 配った後は、また動くまで送らない
	if _, out = step(t, st, Tick{Now: at(3 * time.Second)}); len(out) != 0 {
		t.Errorf("tick after broadcast: out = %+v", out)
	}
}

func TestInvalidTransform(t *testing.T) {
	st := newState("p1")
	in := transformIn("p1", 1, 0)
	in.Msg.Position = api.Vec3{1, 2}
	st, out := step(t, st, in)
	sends := outputsOf[Send](out)
	if len(sends) != 1 || sends[0].To != "p1" || sends[0].Msg.(api.ErrorMessage).Code != "invalid_message" {
		t.Errorf("out = %+v, want error to p1", out)
	}
	if st.player("p1").moved {
		t.Error("invalid transform was accepted")
	}
}

func TestDissolveWhenNotAllConnected(t *testing.T) {
	st := newState("p1", "p2")
	st, _ = step(t, st, Connect{PlayerID: "p1", ConnID: 1, Now: t0})

	st, out := step(t, st, Tick{Now: at(30*time.Second - time.Millisecond)})
	if len(outputsOf[End](out)) != 0 {
		t.Fatal("dissolved before StartTimeout")
	}
	st, out = step(t, st, Tick{Now: at(30 * time.Second)})
	if e := outputsOf[End](out); len(e) != 1 || e[0].Reason != ReasonDissolved || !st.Ended {
		t.Fatalf("out = %+v, want dissolved", out)
	}
	// 終わった後の入力は無視する
	if _, out = step(t, st, Connect{PlayerID: "p2", ConnID: 2, Now: at(31 * time.Second)}); len(out) != 0 {
		t.Errorf("input after end: out = %+v", out)
	}
}

func TestNoDissolveAfterStart(t *testing.T) {
	st := newState("p1")
	// フェーズの締切で決着しないよう、長くしておく
	st.Phases.Duration = 24 * time.Hour
	st, _ = step(t, st, Connect{PlayerID: "p1", ConnID: 1, Now: t0})
	if _, out := step(t, st, Tick{Now: at(time.Hour)}); len(outputsOf[End](out)) != 0 {
		t.Errorf("playing session ended: %+v", out)
	}
}

func TestAbandonWhenAllHumansGone(t *testing.T) {
	st := newState("p1", "p2")
	st.Phases.Duration = 24 * time.Hour
	st, _ = step(t, st, Connect{PlayerID: "p1", ConnID: 1, Now: t0})
	st, _ = step(t, st, Connect{PlayerID: "p2", ConnID: 2, Now: t0})
	st, _ = step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: at(10 * time.Second)})
	st, _ = step(t, st, Disconnect{PlayerID: "p2", ConnID: 2, Now: at(20 * time.Second)})

	// 誰かが戻れば破棄しない
	back, _ := step(t, st, Connect{PlayerID: "p1", ConnID: 3, Now: at(50 * time.Second)})
	if _, out := step(t, back, Tick{Now: at(2 * time.Minute)}); len(outputsOf[End](out)) != 0 {
		t.Errorf("abandoned after a player came back: %+v", out)
	}

	if _, out := step(t, st, Tick{Now: at(80*time.Second - time.Millisecond)}); len(outputsOf[End](out)) != 0 {
		t.Fatal("abandoned before AbandonTimeout")
	}
	_, out := step(t, st, Tick{Now: at(80 * time.Second)})
	if e := outputsOf[End](out); len(e) != 1 || e[0].Reason != ReasonAbandoned {
		t.Errorf("out = %+v, want abandoned", out)
	}
}

func TestHeldItemProjection(t *testing.T) {
	st := newState("p1")
	st.Items[0].Location = Location{Kind: HeldBy, PlayerID: "p1"}
	st.Items = append(st.Items, ItemState{ID: "new", Kind: api.File, Status: api.FileStatusFileCreated, Location: Location{Kind: InDirectory, ObjectID: directoryID}})

	snap := st.Snapshot(t0)
	held := snap.Players[0].HeldItem
	if held == nil || held.Id != directoryStock[0].id || held.Kind != api.File {
		t.Fatalf("heldItem = %+v", held)
	}
	if d := held.Data.(api.FileItemData); d.Status != api.FileStatusUnedited || d.Color == nil || *d.Color != directoryStock[0].color {
		t.Errorf("held data = %+v", d)
	}
	data := snap.Objects[0].Data.(api.DirectoryData)
	if len(data.Stock) != 5 || data.Outputs != 1 {
		t.Errorf("directory = %d in stock, %d outputs; want 5, 1", len(data.Stock), data.Outputs)
	}
}
