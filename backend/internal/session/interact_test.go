package session

import (
	"slices"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

var (
	f1 = directoryStock[0].id
	f2 = directoryStock[1].id
)

func playing(t *testing.T, players ...string) State {
	t.Helper()
	st := newState(players...)
	for i, p := range players {
		st, _ = step(t, st, Connect{PlayerID: p, ConnID: uint64(i + 1), Now: t0})
	}
	if st.Status != api.SessionStatusPlaying {
		t.Fatalf("status = %s", st.Status)
	}
	return st
}

func interactIn(player, objectID string, held *ItemState, target string) ClientInteract {
	in := ClientInteract{PlayerID: player, Now: t0, NewID: "new-1", Msg: api.InteractMessage{Type: api.Interact, ObjectId: objectID}}
	if held != nil {
		in.Msg.HeldItem = &api.HeldItemRef{Id: held.ID, Kind: held.Kind}
	}
	if target != "" {
		in.Msg.Target = &target
	}
	return in
}

func take(t *testing.T, st State, player, fileID string) State {
	t.Helper()
	st, out := step(t, st, interactIn(player, directoryID, nil, fileID))
	if len(outputsOf[Send](out)) != 0 {
		t.Fatalf("take %s: %+v", fileID, out)
	}
	return st
}

func put(t *testing.T, st State, player string) (State, []Output) {
	t.Helper()
	return step(t, st, interactIn(player, directoryID, st.held(player), ""))
}

func wantRejected(t *testing.T, out []Output, to, objectID string, reason api.RejectReason) {
	t.Helper()
	sends := outputsOf[Send](out)
	if len(out) != 1 || len(sends) != 1 || sends[0].To != to {
		t.Fatalf("out = %+v, want only a rejection to %s", out, to)
	}
	m, ok := sends[0].Msg.(api.InteractRejectedMessage)
	if !ok || m.ObjectId != objectID || m.Reason != reason {
		t.Errorf("rejection = %+v, want %s on %s", sends[0].Msg, reason, objectID)
	}
}

func directoryOf(st State) api.DirectoryData {
	return st.gameObject(*st.object(directoryID)).Data.(api.DirectoryData)
}

func stockIDs(st State) []string {
	var ids []string
	for _, f := range directoryOf(st).Stock {
		ids = append(ids, f.Id)
	}
	return ids
}

func TestTakeFromDirectory(t *testing.T) {
	st := playing(t, "p1", "p2")
	seq := st.Seq

	st, out := step(t, st, interactIn("p1", directoryID, nil, f1))
	bc := outputsOf[Broadcast](out)
	if len(bc) != 2 {
		t.Fatalf("out = %+v", out)
	}
	up := bc[0].Msg.(api.ObjectUpsertMessage)
	if up.Seq != seq+1 || up.Object.Id != directoryID || len(up.Object.Data.(api.DirectoryData).Stock) != 5 {
		t.Errorf("object.upsert = %+v", up)
	}
	pu := bc[1].Msg.(api.PlayerUpdatedMessage)
	if pu.Seq != seq+2 || pu.Player.HeldItem == nil || pu.Player.HeldItem.Id != f1 {
		t.Fatalf("player.updated = %+v", pu)
	}
	if d := pu.Player.HeldItem.Data.(api.FileItemData); d.Status != api.FileStatusUnedited || *d.Color != directoryStock[0].color {
		t.Errorf("held data = %+v", d)
	}
	if slices.Contains(stockIDs(st), f1) {
		t.Error("taken file is still in stock")
	}

	_, out = step(t, st, interactIn("p2", directoryID, nil, f1))
	wantRejected(t, out, "p2", directoryID, api.RejectReasonNotFound)
}

func TestTakeRejects(t *testing.T) {
	st := playing(t, "p1")

	_, out := step(t, st, interactIn("p1", directoryID, nil, ""))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonMissingItem)
	_, out = step(t, st, interactIn("p1", directoryID, nil, "no-such-file"))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonNotFound)

	_, out = step(t, st, interactIn("p1", directoryID, &ItemState{ID: f1, Kind: api.File}, ""))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonMissingItem)
	held := take(t, st, "p1", f1)
	_, out = step(t, held, interactIn("p1", directoryID, nil, f2))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonMissingItem)
}

func TestInteractRejects(t *testing.T) {
	waiting := newState("p1", "p2")
	_, out := step(t, waiting, interactIn("p1", directoryID, nil, f1))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonUnavailable)

	st := playing(t, "p1", "p2")
	_, out = step(t, st, interactIn("p1", "no-such-object", nil, ""))
	wantRejected(t, out, "p1", "no-such-object", api.RejectReasonNotFound)
	_, out = step(t, st, interactIn("p1", workspaceID(2), nil, ""))
	wantRejected(t, out, "p1", workspaceID(2), api.RejectReasonNotOwner)

	dead := st.clone()
	dead.player("p1").Life = api.Eliminated
	_, out = step(t, dead, interactIn("p1", directoryID, nil, f1))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonUnavailable)

	off := st.clone()
	off.object(directoryID).Availability = api.ObjectAvailabilityUnavailable
	_, out = step(t, off, interactIn("p1", directoryID, nil, f1))
	wantRejected(t, out, "p1", directoryID, api.RejectReasonUnavailable)
}

func TestPutIntoDirectory(t *testing.T) {
	tests := []struct {
		name        string
		status      api.FileStatus
		wantStock   int
		wantOutputs int
	}{
		{"編集前は在庫に戻る", api.FileStatusUnedited, 6, 0},
		{"編集済みは編集前に戻って在庫に戻る", api.FileStatusEdited, 6, 0},
		{"作ったファイルは成果物になる", api.FileStatusFileCreated, 5, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := take(t, withTasks(playing(t, "p1")), "p1", f1)
			st.held("p1").Status = tt.status

			st, out := put(t, st, "p1")
			bc := outputsOf[Broadcast](out)
			if len(bc) != 2 || bc[1].Msg.(api.PlayerUpdatedMessage).Player.HeldItem != nil {
				t.Fatalf("out = %+v", out)
			}
			data := directoryOf(st)
			if len(data.Stock) != tt.wantStock || data.Outputs != tt.wantOutputs {
				t.Errorf("directory = %d in stock, %d outputs; want %d, %d", len(data.Stock), data.Outputs, tt.wantStock, tt.wantOutputs)
			}
			if tt.status == api.FileStatusEdited {
				i := slices.IndexFunc(data.Stock, func(f api.StockFile) bool { return f.Id == f1 })
				if i < 0 || data.Stock[i].Status != api.StockFileStatusUnedited {
					t.Errorf("stock = %+v, want %s unedited", data.Stock, f1)
				}
			}
		})
	}
}

func TestPutLighterIsRejected(t *testing.T) {
	st := playing(t, "p1")
	st.Items = append(st.Items, ItemState{ID: "lighter-1", Kind: api.Lighter, Location: Location{Kind: HeldBy, PlayerID: "p1"}})
	_, out := put(t, st, "p1")
	wantRejected(t, out, "p1", directoryID, api.RejectReasonMissingItem)
}

func workspaceUsers(st State, seat int) []string {
	return st.object(workspaceID(seat)).Users
}

func TestWorkspaceEdit(t *testing.T) {
	st := take(t, playing(t, "p1"), "p1", f1)
	ws := workspaceID(1)

	st, out := step(t, st, interactIn("p1", ws, st.held("p1"), ""))
	bc := outputsOf[Broadcast](out)
	if len(bc) != 1 || !slices.Equal(bc[0].Msg.(api.ObjectUpsertMessage).Object.Users, []string{"p1"}) {
		t.Fatalf("accept: out = %+v, want workspace with p1 in users", out)
	}

	st, out = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration - time.Millisecond)})
	if len(out) != 0 || st.held("p1").Status != api.FileStatusUnedited {
		t.Fatalf("before 2s: out = %+v", out)
	}

	st, out = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
	bc = outputsOf[Broadcast](out)
	if len(bc) != 2 {
		t.Fatalf("finish: out = %+v", out)
	}
	held := bc[0].Msg.(api.PlayerUpdatedMessage).Player.HeldItem
	if held == nil || held.Id != f1 {
		t.Fatalf("held = %+v, want %s", held, f1)
	}
	if d := held.Data.(api.FileItemData); d.Status != api.FileStatusEdited || *d.Color != directoryStock[0].color {
		t.Errorf("held data = %+v, want edited with the same color", d)
	}
	if users := bc[1].Msg.(api.ObjectUpsertMessage).Object.Users; len(users) != 0 {
		t.Errorf("users = %v after finish", users)
	}
	if len(st.Actions) != 0 {
		t.Errorf("actions = %+v", st.Actions)
	}

	_, out = step(t, st, interactIn("p1", ws, st.held("p1"), ""))
	wantRejected(t, out, "p1", ws, api.RejectReasonMissingItem)
}

func TestWorkspaceCreate(t *testing.T) {
	st := playing(t, "p1")
	ws := workspaceID(1)
	in := interactIn("p1", ws, nil, "")
	in.NewID = "6f1c0d2e-0000-4000-8000-000000000001"

	st, _ = step(t, st, in)
	st, out := step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
	held := outputsOf[Broadcast](out)[0].Msg.(api.PlayerUpdatedMessage).Player.HeldItem
	if held == nil || held.Id != in.NewID {
		t.Fatalf("held = %+v, want the new file", held)
	}
	if d := held.Data.(api.FileItemData); d.Status != api.FileStatusFileCreated || d.Color != nil {
		t.Errorf("held data = %+v, want file_created without color", d)
	}

	_, out = step(t, st, interactIn("p1", ws, st.held("p1"), ""))
	wantRejected(t, out, "p1", ws, api.RejectReasonMissingItem)
}

func TestWorkspaceBusy(t *testing.T) {
	st := playing(t, "p1")
	ws := workspaceID(1)
	st, _ = step(t, st, interactIn("p1", ws, nil, ""))

	_, out := step(t, st, interactIn("p1", ws, nil, ""))
	wantRejected(t, out, "p1", ws, api.RejectReasonUnavailable)

	st, _ = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
	st, out = step(t, st, Tick{Now: t0.Add(2 * WorkspaceActionDuration)})
	if len(out) != 0 || len(slices.DeleteFunc(slices.Clone(st.Items), func(it ItemState) bool { return it.Status != api.FileStatusFileCreated })) != 1 {
		t.Errorf("second tick: out = %+v, items = %+v", out, st.Items)
	}
}

func TestWorkspaceHandChanged(t *testing.T) {
	ws := workspaceID(1)

	t.Run("編集中にファイルを手放した", func(t *testing.T) {
		st := take(t, playing(t, "p1"), "p1", f1)
		st, _ = step(t, st, interactIn("p1", ws, st.held("p1"), ""))
		st, _ = put(t, st, "p1")
		st, out := step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
		if bc := outputsOf[Broadcast](out); len(bc) != 1 || len(workspaceUsers(st, 1)) != 0 {
			t.Errorf("out = %+v, want only the workspace released", out)
		}
		if it := st.item(f1); it.Status != api.FileStatusUnedited {
			t.Errorf("file = %+v, want not edited", it)
		}
	})

	t.Run("新規作成中にファイルを持った", func(t *testing.T) {
		st := playing(t, "p1")
		st, _ = step(t, st, interactIn("p1", ws, nil, ""))
		st = take(t, st, "p1", f1)
		st, out := step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
		if bc := outputsOf[Broadcast](out); len(bc) != 1 || st.item("new-1") != nil || st.held("p1").ID != f1 {
			t.Errorf("out = %+v, want no new file", out)
		}
	})
}

func TestDisconnectReleases(t *testing.T) {
	t.Run("在庫のファイルは在庫に戻り、作業は取りやめる", func(t *testing.T) {
		st := take(t, playing(t, "p1", "p2"), "p1", f1)
		st, _ = step(t, st, interactIn("p1", workspaceID(1), st.held("p1"), ""))

		st, out := step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
		if !slices.Contains(stockIDs(st), f1) || st.held("p1") != nil {
			t.Errorf("stock = %v, held = %+v; want the file returned", stockIDs(st), st.held("p1"))
		}
		if len(workspaceUsers(st, 1)) != 0 || len(st.Actions) != 0 {
			t.Errorf("users = %v, actions = %+v; want the action cancelled", workspaceUsers(st, 1), st.Actions)
		}
		last := outputsOf[Broadcast](out)
		pu := last[len(last)-1].Msg.(api.PlayerUpdatedMessage)
		if pu.Player.Connection != api.Disconnected || pu.Player.HeldItem != nil {
			t.Errorf("player.updated = %+v", pu)
		}
		if _, out = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)}); len(out) != 0 {
			t.Errorf("tick after cancel: out = %+v", out)
		}
	})

	t.Run("作ったファイルは成果物になる", func(t *testing.T) {
		st := playing(t, "p1", "p2")
		st, _ = step(t, st, interactIn("p1", workspaceID(1), nil, ""))
		st, _ = step(t, st, Tick{Now: t0.Add(WorkspaceActionDuration)})
		st, _ = step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
		if d := directoryOf(st); d.Outputs != 1 || len(d.Stock) != 6 {
			t.Errorf("directory = %+v", d)
		}
	})
}

func canvasUsers(st State, seat int) []string {
	return st.object(canvasID(seat)).Users
}

func TestCanvasCreate(t *testing.T) {
	st := playing(t, "p1")
	cv := canvasID(1)
	in := interactIn("p1", cv, nil, "")
	in.NewID = "6f1c0d2e-0000-4000-8000-000000000002"

	st, out := step(t, st, in)
	bc := outputsOf[Broadcast](out)
	if len(bc) != 1 || bc[0].Msg.(api.ObjectUpsertMessage).Object.Id != cv || !slices.Equal(canvasUsers(st, 1), []string{"p1"}) {
		t.Fatalf("accept: out = %+v, want canvas with p1 in users", out)
	}

	st, out = step(t, st, Tick{Now: t0.Add(CanvasActionDuration - time.Millisecond)})
	if len(out) != 0 || st.held("p1") != nil {
		t.Fatalf("before 2s: out = %+v", out)
	}

	st, out = step(t, st, Tick{Now: t0.Add(CanvasActionDuration)})
	bc = outputsOf[Broadcast](out)
	if len(bc) != 2 {
		t.Fatalf("finish: out = %+v", out)
	}
	held := bc[0].Msg.(api.PlayerUpdatedMessage).Player.HeldItem
	if held == nil || held.Id != in.NewID {
		t.Fatalf("held = %+v, want the new file", held)
	}
	if d := held.Data.(api.FileItemData); d.Status != api.FileStatusImageCreated || d.Color != nil {
		t.Errorf("held data = %+v, want image_created without color", d)
	}
	if up := bc[1].Msg.(api.ObjectUpsertMessage); up.Object.Id != cv || len(up.Object.Users) != 0 {
		t.Errorf("object.upsert = %+v after finish", up)
	}
	if len(st.Actions) != 0 {
		t.Errorf("actions = %+v", st.Actions)
	}

	st, _ = put(t, st, "p1")
	if d := directoryOf(st); d.Outputs != 1 || len(d.Stock) != 6 {
		t.Errorf("directory = %+v", d)
	}
}

func TestCanvasRejects(t *testing.T) {
	cv := canvasID(1)

	t.Run("何かを持っていれば missing_item", func(t *testing.T) {
		st := take(t, playing(t, "p1"), "p1", f1)
		_, out := step(t, st, interactIn("p1", cv, st.held("p1"), ""))
		wantRejected(t, out, "p1", cv, api.RejectReasonMissingItem)

		st = paint(t, playing(t, "p1"), "p1", "img-1")
		_, out = step(t, st, interactIn("p1", cv, st.held("p1"), ""))
		wantRejected(t, out, "p1", cv, api.RejectReasonMissingItem)

		_, out = step(t, playing(t, "p1"), interactIn("p1", cv, &ItemState{ID: f1, Kind: api.File}, ""))
		wantRejected(t, out, "p1", cv, api.RejectReasonMissingItem)
	})

	t.Run("作業中は unavailable で、結果は 1 回だけ", func(t *testing.T) {
		st := playing(t, "p1")
		st, _ = step(t, st, interactIn("p1", cv, nil, ""))
		_, out := step(t, st, interactIn("p1", cv, nil, ""))
		wantRejected(t, out, "p1", cv, api.RejectReasonUnavailable)

		st, _ = step(t, st, Tick{Now: t0.Add(CanvasActionDuration)})
		st, out = step(t, st, Tick{Now: t0.Add(2 * CanvasActionDuration)})
		if len(out) != 0 || len(slices.DeleteFunc(slices.Clone(st.Items), func(it ItemState) bool { return it.Status != api.FileStatusImageCreated })) != 1 {
			t.Errorf("second tick: out = %+v, items = %+v", out, st.Items)
		}
	})

	t.Run("他人のキャンバスは not_owner", func(t *testing.T) {
		st := playing(t, "p1", "p2")
		_, out := step(t, st, interactIn("p1", canvasID(2), nil, ""))
		wantRejected(t, out, "p1", canvasID(2), api.RejectReasonNotOwner)
	})
}

func TestCanvasHandChanged(t *testing.T) {
	st := playing(t, "p1")
	st, _ = step(t, st, interactIn("p1", canvasID(1), nil, ""))
	st = take(t, st, "p1", f1)
	st, out := step(t, st, Tick{Now: t0.Add(CanvasActionDuration)})
	if bc := outputsOf[Broadcast](out); len(bc) != 1 || st.item("new-1") != nil || st.held("p1").ID != f1 || len(canvasUsers(st, 1)) != 0 {
		t.Errorf("out = %+v, want only the canvas released without a new file", out)
	}
}

func TestCanvasDisconnectCancels(t *testing.T) {
	st := playing(t, "p1", "p2")
	st, _ = step(t, st, interactIn("p1", canvasID(1), nil, ""))

	st, _ = step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
	if len(canvasUsers(st, 1)) != 0 || len(st.Actions) != 0 {
		t.Errorf("users = %v, actions = %+v; want the action cancelled", canvasUsers(st, 1), st.Actions)
	}
	st, out := step(t, st, Tick{Now: t0.Add(CanvasActionDuration)})
	if len(out) != 0 || st.item("new-1") != nil {
		t.Errorf("tick after cancel: out = %+v", out)
	}

	st = paint(t, playing(t, "p1", "p2"), "p1", "img-1")
	st, _ = step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
	if d := directoryOf(st); d.Outputs != 1 || st.held("p1") != nil {
		t.Errorf("directory = %+v, held = %+v", d, st.held("p1"))
	}
}

func pcUsers(st State, seat int) []string {
	return st.object(pcID(seat)).Users
}

func TestPcCreate(t *testing.T) {
	st := playing(t, "p1")
	pc := pcID(1)
	in := interactIn("p1", pc, nil, "")
	in.NewID = "6f1c0d2e-0000-4000-8000-000000000003"

	st, out := step(t, st, in)
	bc := outputsOf[Broadcast](out)
	if len(bc) != 1 || bc[0].Msg.(api.ObjectUpsertMessage).Object.Id != pc || !slices.Equal(pcUsers(st, 1), []string{"p1"}) {
		t.Fatalf("accept: out = %+v, want pc with p1 in users", out)
	}

	st, out = step(t, st, Tick{Now: t0.Add(PcActionDuration - time.Millisecond)})
	if len(out) != 0 || st.held("p1") != nil {
		t.Fatalf("before 2s: out = %+v", out)
	}

	st, out = step(t, st, Tick{Now: t0.Add(PcActionDuration)})
	bc = outputsOf[Broadcast](out)
	if len(bc) != 2 {
		t.Fatalf("finish: out = %+v", out)
	}
	held := bc[0].Msg.(api.PlayerUpdatedMessage).Player.HeldItem
	if held == nil || held.Id != in.NewID {
		t.Fatalf("held = %+v, want the new file", held)
	}
	if d := held.Data.(api.FileItemData); d.Status != api.FileStatusSearchCreated || d.Color != nil {
		t.Errorf("held data = %+v, want search_created without color", d)
	}
	if up := bc[1].Msg.(api.ObjectUpsertMessage); up.Object.Id != pc || len(up.Object.Users) != 0 {
		t.Errorf("object.upsert = %+v after finish", up)
	}
	if len(st.Actions) != 0 {
		t.Errorf("actions = %+v", st.Actions)
	}

	st, _ = put(t, st, "p1")
	if d := directoryOf(st); d.Outputs != 1 || len(d.Stock) != 6 {
		t.Errorf("directory = %+v", d)
	}
}

func TestPcRejects(t *testing.T) {
	pc := pcID(1)

	t.Run("何かを持っていれば missing_item", func(t *testing.T) {
		st := take(t, playing(t, "p1"), "p1", f1)
		_, out := step(t, st, interactIn("p1", pc, st.held("p1"), ""))
		wantRejected(t, out, "p1", pc, api.RejectReasonMissingItem)

		st = browse(t, playing(t, "p1"), "p1", "search-1")
		_, out = step(t, st, interactIn("p1", pc, st.held("p1"), ""))
		wantRejected(t, out, "p1", pc, api.RejectReasonMissingItem)

		_, out = step(t, playing(t, "p1"), interactIn("p1", pc, &ItemState{ID: f1, Kind: api.File}, ""))
		wantRejected(t, out, "p1", pc, api.RejectReasonMissingItem)
	})

	t.Run("作業中は unavailable で、結果は 1 回だけ", func(t *testing.T) {
		st := playing(t, "p1")
		st, _ = step(t, st, interactIn("p1", pc, nil, ""))
		_, out := step(t, st, interactIn("p1", pc, nil, ""))
		wantRejected(t, out, "p1", pc, api.RejectReasonUnavailable)

		st, _ = step(t, st, Tick{Now: t0.Add(PcActionDuration)})
		st, out = step(t, st, Tick{Now: t0.Add(2 * PcActionDuration)})
		if len(out) != 0 || len(slices.DeleteFunc(slices.Clone(st.Items), func(it ItemState) bool { return it.Status != api.FileStatusSearchCreated })) != 1 {
			t.Errorf("second tick: out = %+v, items = %+v", out, st.Items)
		}
	})

	t.Run("他人の PC は not_owner", func(t *testing.T) {
		st := playing(t, "p1", "p2")
		_, out := step(t, st, interactIn("p1", pcID(2), nil, ""))
		wantRejected(t, out, "p1", pcID(2), api.RejectReasonNotOwner)
	})
}

func TestPcHandChanged(t *testing.T) {
	st := playing(t, "p1")
	st, _ = step(t, st, interactIn("p1", pcID(1), nil, ""))
	st = take(t, st, "p1", f1)
	st, out := step(t, st, Tick{Now: t0.Add(PcActionDuration)})
	if bc := outputsOf[Broadcast](out); len(bc) != 1 || st.item("new-1") != nil || st.held("p1").ID != f1 || len(pcUsers(st, 1)) != 0 {
		t.Errorf("out = %+v, want only the pc released without a new file", out)
	}
}

func TestPcDisconnectCancels(t *testing.T) {
	st := playing(t, "p1", "p2")
	st, _ = step(t, st, interactIn("p1", pcID(1), nil, ""))

	st, _ = step(t, st, Disconnect{PlayerID: "p1", ConnID: 1, Now: t0})
	if len(pcUsers(st, 1)) != 0 || len(st.Actions) != 0 {
		t.Errorf("users = %v, actions = %+v; want the action cancelled", pcUsers(st, 1), st.Actions)
	}
	st, out := step(t, st, Tick{Now: t0.Add(PcActionDuration)})
	if len(out) != 0 || st.item("new-1") != nil {
		t.Errorf("tick after cancel: out = %+v", out)
	}
}
