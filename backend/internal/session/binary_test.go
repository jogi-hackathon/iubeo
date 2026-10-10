package session

import (
	"math"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// playingState は接続済み・プレイ中の 3 人のセッションを作る
func playingState() State {
	st := NewMultiplayerState("sess-bin", []string{"p1", "p2", "p3"}, nil, time.Unix(0, 0), Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, DefaultConfig.Phases, 1)
	st.Status = api.SessionStatusPlaying
	for i := range st.Players {
		st.Players[i].ConnID = uint64(i + 1)
		st.Players[i].Connection = api.Connected
	}
	return st
}

func TestTransformBinaryRoundTrip(t *testing.T) {
	b := make([]byte, binTransformSize)
	b[0] = binTransform
	le.PutUint32(b[1:], 42)
	for i, v := range []float64{1.25, 0, -2.5, 0.75, -0.125} {
		putF32(b[5+i*4:], v)
	}
	m, err := decodeTransformBinary(b)
	if err != nil {
		t.Fatal(err)
	}
	if m.Seq != 42 || m.Position[0] != 1.25 || m.Position[2] != -2.5 || m.Yaw != 0.75 || m.Pitch != -0.125 {
		t.Fatalf("got %+v", m)
	}
	if _, err := decodeTransformBinary(b[:10]); err == nil {
		t.Fatal("短いメッセージを受け付けた")
	}
}

func TestTransformsBinaryUsesSeat(t *testing.T) {
	st := playingState()
	for i := range st.Players {
		st.Players[i].moved = true
		st.Players[i].Transform = api.Transform{Position: api.Vec3{float64(i), 1, 2}, Yaw: 0.5, Seq: int64(10 + i)}
	}
	_, out := Step(st, Tick{Now: time.UnixMilli(1234)})
	msg := out[0].(Broadcast).Msg.(api.TransformsMessage)
	b := encodeTransformsBinary(msg, &st)
	if len(b) != binTransformsHead+3*binPlayerSize || b[0] != binTransforms || b[9] != 3 {
		t.Fatalf("ヘッダが違う: len=%d", len(b))
	}
	if ms := math.Float64frombits(le.Uint64(b[1:])); ms != 1234 {
		t.Fatalf("serverTime=%v", ms)
	}
	for i := range 3 {
		off := binTransformsHead + i*binPlayerSize
		if int(b[off]) != st.Players[i].Seat || le.Uint32(b[off+1:]) != uint32(10+i) || getF32(b[off+5:]) != float64(i) {
			t.Fatalf("プレイヤー %d が違う", i)
		}
	}
}
