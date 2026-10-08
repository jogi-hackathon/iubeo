package session

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

func TestConnDropsOldTransforms(t *testing.T) {
	c := NewConn("p1", nil)
	for _, b := range []string{"a", "b", "c"} {
		deliverBytes(c, api.TransformsMessage{}, []byte(b))
	}
	if got := string(<-c.latest); got != "c" {
		t.Errorf("latest = %q, want only the newest", got)
	}
	select {
	case <-c.Done():
		t.Error("transforms overflow closed the connection")
	default:
	}
}

func TestConnClosesWhenQueueOverflows(t *testing.T) {
	c := NewConn("p1", nil)
	msg := api.PlayerUpdatedMessage{}
	for range sendQueueSize {
		deliverBytes(c, msg, []byte("x"))
	}
	select {
	case <-c.Done():
		t.Fatal("closed before the queue was full")
	default:
	}
	deliverBytes(c, msg, []byte("x"))
	select {
	case <-c.Done():
	default:
		t.Fatal("not closed after the queue overflowed")
	}
	if c.code != CloseSlow {
		t.Errorf("close code = %d, want %d", c.code, CloseSlow)
	}
}

func TestConnFlushesBeforeClose(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		c := NewConn("p1", ws)
		for _, b := range []string{"a", "b", "c"} {
			c.enqueue([]byte(b))
		}
		// 書き出しを始める前に切っても、キューに残ったものは送る
		c.CloseAfterFlush(CloseSessionEnded, string(ReasonFinished))
		c.WriteLoop(r.Context())
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+srv.URL[len("http"):], nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ws.CloseNow() }()
	var got string
	for {
		_, b, err := ws.Read(ctx)
		if err != nil {
			var ce websocket.CloseError
			if !errors.As(err, &ce) || ce.Code != CloseSessionEnded {
				t.Fatalf("read: %v", err)
			}
			break
		}
		got += string(b)
	}
	if got != "abc" {
		t.Errorf("received %q before close, want abc", got)
	}
}
