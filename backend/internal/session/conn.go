package session

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

const (
	sendQueueSize = 64
	writeTimeout  = 5 * time.Second
	pingInterval  = 15 * time.Second
	pingTimeout   = 10 * time.Second
)

const (
	CloseSessionEnded websocket.StatusCode = 4000
	CloseReplaced     websocket.StatusCode = 4001
	CloseSlow         websocket.StatusCode = 4002
)

var connSeq atomic.Uint64

type Conn struct {
	ID       uint64
	PlayerID string
	ws       *websocket.Conn
	Binary   bool

	queue  chan []byte
	latest chan []byte

	closeOnce sync.Once
	closed    chan struct{}
	code      websocket.StatusCode
	reason    string
	flush     bool
}

func NewConn(playerID string, ws *websocket.Conn) *Conn {
	return &Conn{
		ID:       connSeq.Add(1),
		PlayerID: playerID,
		ws:       ws,
		queue:    make(chan []byte, sendQueueSize),
		latest:   make(chan []byte, 1),
		closed:   make(chan struct{}),
	}
}

func (c *Conn) Close(code websocket.StatusCode, reason string) {
	c.close(code, reason, false)
}

func (c *Conn) CloseAfterFlush(code websocket.StatusCode, reason string) {
	c.close(code, reason, true)
}

func (c *Conn) close(code websocket.StatusCode, reason string, flush bool) {
	c.closeOnce.Do(func() {
		c.code, c.reason, c.flush = code, reason, flush
		close(c.closed)
	})
}

func (c *Conn) Done() <-chan struct{} {
	return c.closed
}

func (c *Conn) enqueue(b []byte) {
	select {
	case c.queue <- b:
	default:
		c.Close(CloseSlow, "send queue overflow")
	}
}

func (c *Conn) replaceLatest(b []byte) {
	for {
		select {
		case c.latest <- b:
			return
		default:
		}
		select {
		case <-c.latest:
		default:
		}
	}
}

func (c *Conn) WriteLoop(ctx context.Context) {
	ping := time.NewTicker(pingInterval)
	defer ping.Stop()
	for {
		var b []byte
		typ := websocket.MessageText
		select {
		case <-ctx.Done():
			c.Close(websocket.StatusGoingAway, "server shutting down")
		case <-c.closed:
		case b = <-c.queue:
		case b = <-c.latest:
			if c.Binary {
				typ = websocket.MessageBinary
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := c.ws.Ping(pctx)
			cancel()
			if err != nil {
				c.Close(websocket.StatusGoingAway, "ping timeout")
			}
			continue
		}
		if b == nil {
			if c.flush {
				c.drain(ctx)
			}
			_ = c.ws.Close(c.code, c.reason)
			return
		}
		wctx, cancel := context.WithTimeout(ctx, writeTimeout)
		err := c.ws.Write(wctx, typ, b)
		cancel()
		if err != nil {
			c.Close(websocket.StatusGoingAway, "write failed")
		}
	}
}

func (c *Conn) drain(ctx context.Context) {
	for {
		select {
		case b := <-c.queue:
			wctx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.ws.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				return
			}
		default:
			return
		}
	}
}

func (c *Conn) SendError(code, message string) {
	if b, ok := encode(errorMessage(code, message)); ok {
		c.enqueue(b)
	}
}
