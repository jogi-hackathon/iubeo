package server

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
	"github.com/jogi-hackathon/iubeo/backend/internal/session"
)

type testPlayer struct {
	id     string
	cookie *http.Cookie
}

func matchPlayers(t *testing.T, h http.Handler, size int) (string, []testPlayer) {
	t.Helper()
	players := make([]testPlayer, size)
	var sessionID string
	for i := range players {
		c, id := newPlayer(t, h)
		players[i] = testPlayer{id: id, cookie: c}
		st := decode[api.MatchmakingStatus](t, do(t, h, http.MethodPost, "/api/v1/matchmaking", c))
		if st.SessionId != nil {
			sessionID = *st.SessionId
		}
	}
	if sessionID == "" {
		t.Fatal("players were not matched")
	}
	return sessionID, players
}

func dial(t *testing.T, srv *httptest.Server, sessionID string, p testPlayer, origin string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	header := http.Header{}
	if origin != "" {
		header.Set("Origin", origin)
	}
	header.Set("Cookie", p.cookie.String())
	return websocket.Dial(ctx, "ws"+srv.URL[len("http"):]+"/api/v1/sessions/"+sessionID+"/ws", &websocket.DialOptions{HTTPHeader: header})
}

func mustDial(t *testing.T, srv *httptest.Server, sessionID string, p testPlayer) *websocket.Conn {
	t.Helper()
	ws, _, err := dial(t, srv, sessionID, p, testOrigin)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = ws.CloseNow() })
	return ws
}

type received struct {
	Type string `json:"type"`
	raw  []byte
}

func read(t *testing.T, ws *websocket.Conn) (received, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, data, err := ws.Read(ctx)
	if err != nil {
		return received{}, err
	}
	var r received
	if err := json.Unmarshal(data, &r); err != nil {
		t.Fatalf("unmarshal %s: %v", data, err)
	}
	r.raw = data
	return r, nil
}

func readType[T any](t *testing.T, ws *websocket.Conn, want string) T {
	t.Helper()
	for {
		r, err := read(t, ws)
		if err != nil {
			t.Fatalf("waiting for %s: %v", want, err)
		}
		if r.Type != want {
			continue
		}
		var v T
		if err := json.Unmarshal(r.raw, &v); err != nil {
			t.Fatalf("unmarshal %s: %v", r.raw, err)
		}
		return v
	}
}

func write(t *testing.T, ws *websocket.Conn, v any) {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := ws.Write(ctx, websocket.MessageText, b); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func waitClose(t *testing.T, ws *websocket.Conn) websocket.CloseError {
	t.Helper()
	for {
		_, err := read(t, ws)
		if err == nil {
			continue
		}
		var ce websocket.CloseError
		if !errors.As(err, &ce) {
			t.Fatalf("read error = %v, want a close", err)
		}
		return ce
	}
}

func TestGetSession(t *testing.T) {
	h := newTestServerSize(t, 1)
	sessionID, players := matchPlayers(t, h, 1)
	outsider, _ := newPlayer(t, h)
	path := "/api/v1/sessions/" + sessionID

	if res := do(t, h, http.MethodGet, path); res.StatusCode != http.StatusUnauthorized {
		t.Errorf("without cookie: status = %d, want 401", res.StatusCode)
	}
	if res := do(t, h, http.MethodGet, "/api/v1/sessions/sess-unknown", players[0].cookie); res.StatusCode != http.StatusNotFound {
		t.Errorf("unknown session: status = %d, want 404", res.StatusCode)
	}
	if res := do(t, h, http.MethodGet, path, outsider); res.StatusCode != http.StatusForbidden {
		t.Errorf("outsider: status = %d, want 403", res.StatusCode)
	}
	res := do(t, h, http.MethodGet, path, players[0].cookie)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("participant: status = %d, want 200", res.StatusCode)
	}
	snap := decode[api.SessionSnapshot](t, res)
	if snap.SessionId != sessionID || snap.Status != api.SessionStatusWaiting || len(snap.Players) != 1 || snap.Players[0].PlayerId != players[0].id {
		t.Errorf("snapshot = %+v", snap)
	}
}

func TestWebSocketRejects(t *testing.T) {
	h := newTestServerSize(t, 1)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	outsider, outsiderID := newPlayer(t, h)

	tests := []struct {
		name   string
		player testPlayer
		origin string
		want   int
	}{
		{"Origin が無い", players[0], "", http.StatusForbidden},
		{"許可していない Origin", players[0], "http://evil.example", http.StatusForbidden},
		{"参加者でない", testPlayer{id: outsiderID, cookie: outsider}, testOrigin, http.StatusForbidden},
		{"Cookie が無効", testPlayer{cookie: &http.Cookie{Name: "iubeo_player", Value: "x"}}, testOrigin, http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, res, err := dial(t, srv, sessionID, tt.player, tt.origin)
			if err == nil {
				t.Fatal("dial succeeded")
			}
			if res == nil || res.StatusCode != tt.want {
				t.Errorf("response = %v, want %d", res, tt.want)
			}
		})
	}
}

func TestWebSocketSession(t *testing.T) {
	h := newTestServerSize(t, 2)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 2)
	p1, p2 := players[0], players[1]

	ws1 := mustDial(t, srv, sessionID, p1)
	snap1 := readType[api.SnapshotMessage](t, ws1, "snapshot").Session
	if snap1.Status != api.SessionStatusWaiting || snap1.Seq != 1 || snap1.Players[0].Connection != api.Connected {
		t.Fatalf("p1 snapshot = status %s, seq %d, players %+v", snap1.Status, snap1.Seq, snap1.Players)
	}

	ws2 := mustDial(t, srv, sessionID, p2)
	snap2 := readType[api.SnapshotMessage](t, ws2, "snapshot").Session
	if snap2.Seq != 2 || snap2.Players[1].Connection != api.Connected {
		t.Fatalf("p2 snapshot = seq %d, players %+v", snap2.Seq, snap2.Players)
	}
	if m := readType[api.PlayerUpdatedMessage](t, ws1, "player.updated"); m.Player.PlayerId != p2.id || m.Seq != 2 {
		t.Errorf("p1 got player.updated %+v", m)
	}
	for _, ws := range []*websocket.Conn{ws1, ws2} {
		if m := readType[api.SessionStartedMessage](t, ws, "session.started"); m.Seq != 3 {
			t.Errorf("session.started = %+v", m)
		}
	}

	write(t, ws1, api.TransformMessage{Type: api.TransformMessageTypeTransform, Seq: 1, Position: api.Vec3{1, 0, 2}, Yaw: 0.5})
	tr := readType[api.TransformsMessage](t, ws2, "transforms")
	if len(tr.Players) != 1 || tr.Players[0].PlayerId != p1.id || tr.Players[0].Transform.Position[2] != 2 {
		t.Errorf("transforms = %+v", tr)
	}

	file := snap1.Objects[0].Data.(map[string]any)["stock"].([]any)[0].(map[string]any)["id"].(string)
	write(t, ws1, api.InteractMessage{Type: api.Interact, ObjectId: "directory-1", Target: &file})
	for _, ws := range []*websocket.Conn{ws1, ws2} {
		readType[api.ObjectUpsertMessage](t, ws, "object.upsert")
		if m := readType[api.PlayerUpdatedMessage](t, ws, "player.updated"); m.Player.PlayerId != p1.id || m.Player.HeldItem == nil || m.Player.HeldItem.Id != file {
			t.Errorf("player.updated after take = %+v", m)
		}
	}
	write(t, ws2, api.InteractMessage{Type: api.Interact, ObjectId: "directory-1", Target: &file})
	if m := readType[api.InteractRejectedMessage](t, ws2, "object.interactRejected"); m.Reason != api.RejectReasonNotFound {
		t.Errorf("second take: %+v, want not_found", m)
	}
	write(t, ws1, map[string]string{"type": "dance"})
	if m := readType[api.ErrorMessage](t, ws1, "error"); m.Code != "invalid_message" {
		t.Errorf("unknown type: error = %+v", m)
	}

	ws1b := mustDial(t, srv, sessionID, p1)
	if snap := readType[api.SnapshotMessage](t, ws1b, "snapshot").Session; snap.Status != api.SessionStatusPlaying {
		t.Errorf("reconnect snapshot status = %s", snap.Status)
	}
	if ce := waitClose(t, ws1); ce.Code != session.CloseReplaced {
		t.Errorf("old connection closed with %v, want %d", ce, session.CloseReplaced)
	}

	_ = ws2.Close(websocket.StatusNormalClosure, "")
	m := readType[api.PlayerUpdatedMessage](t, ws1b, "player.updated")
	if m.Player.PlayerId != p2.id || m.Player.Connection != api.Disconnected {
		t.Errorf("player.updated after disconnect = %+v", m)
	}
}

func TestSessionDissolves(t *testing.T) {
	cfg := session.DefaultConfig
	cfg.StartTimeout = 300 * time.Millisecond
	h := newTestServerWith(t, 2, cfg)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 2)

	ws := mustDial(t, srv, sessionID, players[0])
	ce := waitClose(t, ws)
	if ce.Code != session.CloseSessionEnded || ce.Reason != string(session.ReasonDissolved) {
		t.Errorf("closed with %v, want dissolved", ce)
	}

	deadline := time.Now().Add(3 * time.Second)
	for {
		me := decode[api.Me](t, do(t, h, http.MethodGet, "/api/v1/players/me", players[0].cookie))
		if me.SessionId == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("session still attached after dissolve: %+v", me)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if res := do(t, h, http.MethodGet, "/api/v1/sessions/"+sessionID, players[0].cookie); res.StatusCode != http.StatusNotFound {
		t.Errorf("GET dissolved session: status = %d, want 404", res.StatusCode)
	}
	if res := do(t, h, http.MethodGet, "/api/v1/matchmaking", players[1].cookie); res.StatusCode != http.StatusNotFound {
		t.Errorf("GET matchmaking after dissolve: status = %d, want 404", res.StatusCode)
	}
}

func TestWorkspaceOverWebSocket(t *testing.T) {
	h := newTestServerSize(t, 1)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	ws := mustDial(t, srv, sessionID, players[0])
	readType[api.SessionStartedMessage](t, ws, "session.started")

	start := time.Now()
	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "workspace-1"})
	if m := readType[api.ObjectUpsertMessage](t, ws, "object.upsert"); len(m.Object.Users) != 1 {
		t.Fatalf("accept: users = %v", m.Object.Users)
	}
	m := readType[api.PlayerUpdatedMessage](t, ws, "player.updated")
	if elapsed := time.Since(start); elapsed < session.WorkspaceActionDuration {
		t.Errorf("result after %s, want at least %s", elapsed, session.WorkspaceActionDuration)
	}
	held := m.Player.HeldItem
	if held == nil || held.Kind != api.File || len(held.Id) != 36 {
		t.Fatalf("held = %+v, want a new file with a UUID", held)
	}
	if status := held.Data.(map[string]any)["status"]; status != string(api.FileStatusFileCreated) {
		t.Errorf("status = %v", status)
	}
	if m := readType[api.ObjectUpsertMessage](t, ws, "object.upsert"); len(m.Object.Users) != 0 {
		t.Errorf("finish: users = %v", m.Object.Users)
	}
}

func TestCanvasOverWebSocket(t *testing.T) {
	h := newTestServerSize(t, 1)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	ws := mustDial(t, srv, sessionID, players[0])
	readType[api.SessionStartedMessage](t, ws, "session.started")

	start := time.Now()
	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "canvas-1"})
	if m := readType[api.ObjectUpsertMessage](t, ws, "object.upsert"); m.Object.Id != "canvas-1" || len(m.Object.Users) != 1 {
		t.Fatalf("accept: object = %+v", m.Object)
	}
	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "canvas-1"})
	if m := readType[api.InteractRejectedMessage](t, ws, "object.interactRejected"); m.Reason != api.RejectReasonUnavailable {
		t.Errorf("rejection = %+v", m)
	}
	m := readType[api.PlayerUpdatedMessage](t, ws, "player.updated")
	if elapsed := time.Since(start); elapsed < session.CanvasActionDuration {
		t.Errorf("result after %s, want at least %s", elapsed, session.CanvasActionDuration)
	}
	held := m.Player.HeldItem
	if held == nil || held.Kind != api.File || len(held.Id) != 36 {
		t.Fatalf("held = %+v, want a new file with a UUID", held)
	}
	if data := held.Data.(map[string]any); data["status"] != string(api.FileStatusImageCreated) || data["color"] != nil {
		t.Errorf("data = %v, want image_created without color", data)
	}
	if m := readType[api.ObjectUpsertMessage](t, ws, "object.upsert"); len(m.Object.Users) != 0 {
		t.Errorf("finish: users = %v", m.Object.Users)
	}

	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "canvas-1", HeldItem: &api.HeldItemRef{Id: held.Id, Kind: api.File}})
	if m := readType[api.InteractRejectedMessage](t, ws, "object.interactRejected"); m.Reason != api.RejectReasonMissingItem {
		t.Errorf("rejection = %+v", m)
	}
}

func TestPhaseOverWebSocket(t *testing.T) {
	h := newTestServerSize(t, 1)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	ws := mustDial(t, srv, sessionID, players[0])
	readType[api.SessionStartedMessage](t, ws, "session.started")

	started := readType[api.PhaseStartedMessage](t, ws, "phase.started")
	ph := started.Phase
	if ph.Number != 1 || ph.Status != api.PhaseStatusActive || len(ph.Tasks) != 1 || started.ServerTime.IsZero() {
		t.Fatalf("phase.started = %+v", started)
	}
	if d := ph.DeadlineAt.Sub(ph.StartedAt); d != session.DefaultConfig.Phases.Duration {
		t.Errorf("deadline - start = %s", d)
	}
	task := ph.Tasks[0]
	if task.AssigneePlayerId != players[0].id {
		t.Fatalf("task = %+v", task)
	}

	doTask(t, ws, task)

	snap := decode[api.SessionSnapshot](t, do(t, h, http.MethodGet, "/api/v1/sessions/"+sessionID, players[0].cookie))
	if snap.Game.Phase == nil || snap.Game.Phase.Tasks[0].Status != api.TaskStatusCompleted {
		t.Errorf("snapshot phase = %+v", snap.Game.Phase)
	}
}

func doTask(t *testing.T, ws *websocket.Conn, task api.Task) {
	t.Helper()
	var held api.HeldItemRef
	switch task.Type {
	case api.ReadEdit:
		write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "directory-1", Target: task.TargetFileId})
		held = api.HeldItemRef{Id: *task.TargetFileId, Kind: api.File}
		write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "workspace-1", HeldItem: &held})
	case api.ImageGeneration:
		write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "canvas-1"})
	default:
		write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "workspace-1"})
	}
	for {
		m := readType[api.PlayerUpdatedMessage](t, ws, "player.updated")
		if hi := m.Player.HeldItem; hi != nil && hi.Data.(map[string]any)["status"] != string(api.FileStatusUnedited) {
			held = api.HeldItemRef{Id: hi.Id, Kind: hi.Kind}
			break
		}
	}
	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "directory-1", HeldItem: &held})
	if m := readType[api.TaskCompletedMessage](t, ws, "task.completed"); m.TaskId != task.TaskId {
		t.Errorf("task.completed = %+v, want %s", m, task.TaskId)
	}
}

func waitGone(t *testing.T, h http.Handler, sessionID string, p testPlayer) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for do(t, h, http.MethodGet, "/api/v1/sessions/"+sessionID, p.cookie).StatusCode != http.StatusNotFound {
		if time.Now().After(deadline) {
			t.Fatal("session was not removed")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestPhasesToDefeatOverWebSocket(t *testing.T) {
	cfg := session.DefaultConfig
	cfg.Phases = session.PhaseRules{Count: 2, Duration: 2600 * time.Millisecond, Intermission: 200 * time.Millisecond}
	h := newTestServerWith(t, 1, cfg)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	ws := mustDial(t, srv, sessionID, players[0])

	first := readType[api.PhaseStartedMessage](t, ws, "phase.started")
	doTask(t, ws, first.Phase.Tasks[0])
	if m := readType[api.PhaseEndedMessage](t, ws, "phase.ended"); m.PhaseNumber != 1 || m.Next != api.PhaseEndedMessageNextIntermission || len(m.EliminatedPlayerIds) != 0 {
		t.Fatalf("phase.ended = %+v", m)
	}
	ended := time.Now()

	if m := readType[api.ObjectUpsertMessage](t, ws, "object.upsert"); m.Object.Data.(map[string]any)["outputs"] != float64(0) {
		t.Errorf("reset directory = %+v", m.Object.Data)
	}
	second := readType[api.PhaseStartedMessage](t, ws, "phase.started")
	if time.Since(ended) < 150*time.Millisecond || second.Phase.Number != 2 || len(second.Phase.Tasks) != 2 {
		t.Fatalf("phase.started after %s = %+v", time.Since(ended), second)
	}

	if m := readType[api.PlayerUpdatedMessage](t, ws, "player.updated"); m.Player.Life != api.Eliminated {
		t.Errorf("player.updated = %+v", m)
	}
	if m := readType[api.EffectMessage](t, ws, "effect"); m.Name != api.EffectMessageNameFall || m.PlayerId == nil || *m.PlayerId != players[0].id {
		t.Errorf("effect = %+v", m)
	}
	if m := readType[api.PhaseEndedMessage](t, ws, "phase.ended"); m.PhaseNumber != 2 || m.Next != api.PhaseEndedMessageNextCompleted || len(m.EliminatedPlayerIds) != 1 {
		t.Errorf("phase.ended = %+v", m)
	}
	if m := readType[api.SessionFinishedMessage](t, ws, "session.finished"); m.Result.Outcome != api.Defeat {
		t.Errorf("session.finished = %+v", m)
	}
	if ce := waitClose(t, ws); ce.Code != session.CloseSessionEnded || ce.Reason != string(session.ReasonFinished) {
		t.Errorf("closed with %v, want finished", ce)
	}
	waitGone(t, h, sessionID, players[0])
}

func TestVictoryOverWebSocket(t *testing.T) {
	cfg := session.DefaultConfig
	cfg.Phases.Count = 1
	cfg.Phases.Fire = 300 * time.Millisecond
	h := newTestServerWith(t, 1, cfg)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	ws := mustDial(t, srv, sessionID, players[0])

	started := readType[api.PhaseStartedMessage](t, ws, "phase.started")
	doTask(t, ws, started.Phase.Tasks[0])
	if m := readType[api.PhaseEndedMessage](t, ws, "phase.ended"); m.Next != api.PhaseEndedMessageNextCompleted || len(m.EliminatedPlayerIds) != 0 {
		t.Errorf("phase.ended = %+v", m)
	}
	if m := readType[api.TeamUpdatedMessage](t, ws, "team.updated"); !m.Team.BypassPermission || m.Team.FireStarted {
		t.Errorf("team.updated = %+v", m)
	}
	if m := readType[api.ObjectUpsertMessage](t, ws, "object.upsert"); m.Object.Id != "lighter_stand-1" || m.Object.Availability != api.ObjectAvailabilityAvailable {
		t.Errorf("object.upsert = %+v", m)
	}

	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "lighter_stand-1"})
	m := readType[api.PlayerUpdatedMessage](t, ws, "player.updated")
	if m.Player.HeldItem == nil || m.Player.HeldItem.Kind != api.Lighter {
		t.Fatalf("player.updated = %+v", m)
	}
	write(t, ws, api.InteractMessage{Type: api.Interact, ObjectId: "directory-1", HeldItem: &api.HeldItemRef{Id: m.Player.HeldItem.Id, Kind: api.Lighter}})
	if m := readType[api.TeamUpdatedMessage](t, ws, "team.updated"); !m.Team.FireStarted {
		t.Errorf("team.updated = %+v", m)
	}
	if m := readType[api.EffectMessage](t, ws, "effect"); m.Name != api.EffectMessageNameFire {
		t.Errorf("effect = %+v", m)
	}
	fired := time.Now()
	if m := readType[api.SessionFinishedMessage](t, ws, "session.finished"); m.Result.Outcome != api.Victory {
		t.Errorf("session.finished = %+v", m)
	}
	if elapsed := time.Since(fired); elapsed < 250*time.Millisecond {
		t.Errorf("finished %s after the fire, want after the fire effect", elapsed)
	}
	if ce := waitClose(t, ws); ce.Code != session.CloseSessionEnded || ce.Reason != string(session.ReasonFinished) {
		t.Errorf("closed with %v, want finished", ce)
	}
	waitGone(t, h, sessionID, players[0])
}

// TestBinaryTransformsOverWebSocket は enc=bin の接続で、位置をバイナリでやり取りする(session/binary.go)。
// それ以外のメッセージ(snapshot など)は JSON のまま
func TestBinaryTransformsOverWebSocket(t *testing.T) {
	h := newTestServerSize(t, 1)
	srv := httptest.NewServer(h)
	defer srv.Close()
	sessionID, players := matchPlayers(t, h, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	header := http.Header{"Origin": []string{testOrigin}, "Cookie": []string{players[0].cookie.String()}}
	ws, _, err := websocket.Dial(ctx, "ws"+srv.URL[len("http"):]+"/api/v1/sessions/"+sessionID+"/ws?enc=bin", &websocket.DialOptions{HTTPHeader: header})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = ws.CloseNow() }()
	snap := readType[api.SnapshotMessage](t, ws, "snapshot").Session
	seat := snap.Players[0].Seat
	readType[api.SessionStartedMessage](t, ws, "session.started")

	// transform(25B): type=1 | seq u32 | x y z | yaw | pitch(f32)
	msg := make([]byte, 25)
	msg[0] = 1
	binary.LittleEndian.PutUint32(msg[1:], 9)
	for i, v := range []float32{1.5, 0, -2, 0.25, 0} {
		binary.LittleEndian.PutUint32(msg[5+i*4:], math.Float32bits(v))
	}
	if err := ws.Write(ctx, websocket.MessageBinary, msg); err != nil {
		t.Fatalf("write: %v", err)
	}
	for {
		typ, data, err := ws.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if typ != websocket.MessageBinary {
			continue
		}
		// transforms: type=2 | serverTime f64 | n u8 | n × (seat u8 | seq u32 | f32 × 5)
		if len(data) != 10+25 || data[0] != 2 || data[9] != 1 {
			t.Fatalf("transforms の形が違う: % x", data)
		}
		if int(data[10]) != seat || binary.LittleEndian.Uint32(data[11:]) != 9 ||
			math.Float32frombits(binary.LittleEndian.Uint32(data[15:])) != 1.5 {
			t.Fatalf("transforms の中身が違う: % x", data)
		}
		return
	}
}
