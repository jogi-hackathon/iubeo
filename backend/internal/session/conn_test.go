package session

import (
	"testing"

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
