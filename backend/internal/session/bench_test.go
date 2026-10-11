package session

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

func benchPlaying() State {
	st := NewMultiplayerState("sess-bench", []string{"p1", "p2", "p3"}, nil, time.Unix(0, 0), Timeouts{Start: 30 * time.Second, Abandon: 60 * time.Second}, DefaultConfig.Phases, 1)
	st.Status = api.SessionStatusPlaying
	for i := range st.Players {
		st.Players[i].ConnID = uint64(i + 1)
		st.Players[i].Connection = api.Connected
	}
	return st
}

func BenchmarkStepClientTransform(b *testing.B) {
	st := benchPlaying()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		msg := api.TransformMessage{Type: api.TransformMessageTypeTransform, Seq: int64(i + 1), Position: api.Vec3{1, 0, 2}}
		st, _ = Step(st, ClientTransform{PlayerID: "p1", Msg: msg})
	}
}

func BenchmarkStepTick(b *testing.B) {
	st := benchPlaying()
	for i := range st.Players {
		st.Players[i].moved = true
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = Step(st, Tick{Now: time.Unix(0, 0)})
	}
}

func BenchmarkDecodeTransform(b *testing.B) {
	raw := []byte(`{"type":"transform","seq":12345,"position":[1.25,0,-2.5],"yaw":0.7853981633974483,"pitch":-0.12}`)
	s := &Session{inbox: make(chan any, b.N+1), done: make(chan struct{})}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := s.ReceiveJSON("p1", raw); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkEncodeTransforms(b *testing.B) {
	st := benchPlaying()
	for i := range st.Players {
		st.Players[i].moved = true
	}
	_, out := Step(st, Tick{Now: time.Unix(0, 0)})
	msg := out[0].(Broadcast).Msg
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := json.Marshal(msg); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkEncodeTransformsBinary(b *testing.B) {
	st := benchPlaying()
	for i := range st.Players {
		st.Players[i].moved = true
	}
	_, out := Step(st, Tick{Now: time.Unix(0, 0)})
	msg := out[0].(Broadcast).Msg.(api.TransformsMessage)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = encodeTransformsBinary(msg, &st)
	}
}

func BenchmarkDecodeTransformBinary(b *testing.B) {
	raw := make([]byte, binTransformSize)
	raw[0] = binTransform
	le.PutUint32(raw[1:], 12345)
	s := &Session{inbox: make(chan any, b.N+1), done: make(chan struct{})}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := s.ReceiveBinary("p1", raw); err != nil {
			b.Fatal(err)
		}
	}
}
