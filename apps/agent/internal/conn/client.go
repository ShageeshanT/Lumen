package conn

import (
	"context"
	"crypto/ed25519"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"

	"github.com/ShageeshanT/Lumen/packages/protocol"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// WebSocket close codes shared with apps/api/src/gateway (PHASE-02 §5).
const (
	CloseSuperseded   websocket.StatusCode = 4001
	CloseBadSequence  websocket.StatusCode = 4002
	CloseRevoked      websocket.StatusCode = 4003
	CloseRateLimited  websocket.StatusCode = 4008
	CloseUnauthorized websocket.StatusCode = 4401
)

const (
	ioTimeout    = 30 * time.Second
	pingInterval = 10 * time.Second
)

// RejectedError means the control plane answered AgentHello with accepted=false.
type RejectedError struct{ Reason string }

func (e *RejectedError) Error() string { return "control plane rejected the connection: " + e.Reason }

// ErrUnauthorized means the control plane refused the credential.
var ErrUnauthorized = errors.New("the control plane did not accept this server's credential")

// Handler receives what arrives on the connection.
type Handler interface {
	// OnControlHello runs once per connection, before anything else is read.
	OnControlHello(ctx context.Context, ch *agentv1.ControlHello)
	// OnMessage runs on the reader goroutine; long work must be spawned.
	OnMessage(ctx context.Context, body *agentv1.Envelope)
	// OnState reports "connecting", "online" or "offline" transitions.
	OnState(state string, err error)
}

// Config describes how to reach the control plane.
type Config struct {
	URL             string
	ServerID        string
	Credential      func() string
	Identity        ed25519.PrivateKey
	ControlPlaneKey ed25519.PublicKey
	TLS             *tls.Config
	Clock           *Clock
	Log             *slog.Logger
	// Hello builds the AgentHello sent first on every connection.
	Hello func(ctx context.Context) *agentv1.AgentHello
}

// Client owns the connection loop and the send queue.
type Client struct {
	cfg        Config
	queue      *Queue
	online     atomic.Bool
	reconnects atomic.Uint64
	badSigs    atomic.Uint64
}

// New returns a client; call Run to connect.
func New(cfg Config) *Client {
	if cfg.Clock == nil {
		cfg.Clock = &Clock{}
	}
	return &Client{cfg: cfg, queue: NewQueue()}
}

// Send queues a body-only envelope. While offline only critical messages are
// kept (heartbeats and metrics would be stale on reconnect).
func (c *Client) Send(body *agentv1.Envelope, class Class) bool {
	if !c.online.Load() && class != Critical {
		return false
	}
	return c.queue.Push(body, class)
}

// Online reports whether a connection is established and accepted.
func (c *Client) Online() bool { return c.online.Load() }

// QueueLen is the current send queue length.
func (c *Client) QueueLen() int { return c.queue.Len() }

// Reconnects is the number of connections after the first.
func (c *Client) Reconnects() uint64 { return c.reconnects.Load() }

// BadSignatures counts incoming envelopes that failed verification.
func (c *Client) BadSignatures() uint64 { return c.badSigs.Load() }

// Clock is the skew-corrected clock.
func (c *Client) Clock() *Clock { return c.cfg.Clock }

// Run connects and reconnects until ctx is done.
func (c *Client) Run(ctx context.Context, h Handler) {
	var b Backoff
	var lastStep time.Duration
	first := true
	for ctx.Err() == nil {
		if !first {
			c.reconnects.Add(1)
		}
		first = false
		h.OnState("connecting", nil)
		started := time.Now()
		err := c.session(ctx, h)
		c.online.Store(false)
		c.queue.DropDroppable()
		if ctx.Err() != nil {
			return
		}
		lasted := time.Since(started)
		b.Connected(lasted)
		h.OnState("offline", err)
		delay, step := b.Next()
		// Log once per backoff step, not on every attempt (PHASE-02 §5).
		if step != lastStep {
			c.cfg.Log.Warn("lost the connection to the control plane; retrying",
				"err", err, "retry_in", delay.Round(100*time.Millisecond).String())
			lastStep = step
		}
		if lasted >= StableAfter {
			lastStep = 0
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
	}
}

func (c *Client) session(ctx context.Context, h Handler) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	hdr := http.Header{}
	hdr.Set("Authorization", "Bearer "+c.cfg.ServerID+"."+c.cfg.Credential())
	hdr.Set("X-Lumen-Protocol", strconv.FormatUint(uint64(protocol.ProtocolVersion), 10))
	dialCtx, dialCancel := context.WithTimeout(ctx, ioTimeout)
	ws, resp, err := websocket.Dial(dialCtx, c.cfg.URL, &websocket.DialOptions{
		HTTPHeader: hdr,
		HTTPClient: &http.Client{Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment, TLSClientConfig: c.cfg.TLS,
		}},
	})
	dialCancel()
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			return ErrUnauthorized
		}
		return fmt.Errorf("dial: %w", err)
	}
	defer func() { _ = ws.CloseNow() }()
	ws.SetReadLimit(protocol.MaxMessageBytes + 4096)

	signer := NewSigner(c.cfg.Identity, c.cfg.ServerID, c.cfg.Clock)
	verifier := NewVerifier(c.cfg.ControlPlaneKey, c.cfg.ServerID)

	write := func(body *agentv1.Envelope) error {
		env, err := signer.Seal(body)
		if err != nil {
			return err
		}
		frame, err := protocol.Marshal(env)
		if err != nil {
			return err
		}
		wctx, wcancel := context.WithTimeout(ctx, ioTimeout)
		defer wcancel()
		if err := ws.Write(wctx, websocket.MessageBinary, frame); err != nil {
			return fmt.Errorf("write: %w", err)
		}
		return nil
	}
	// Only the ControlHello wait has a read deadline. Afterwards the control
	// plane may legitimately send nothing for a while; liveness comes from our
	// ping every 10 s, which fails the connection when no pong arrives within
	// 30 s. (A canceled Read context closes the socket in coder/websocket.)
	read := func(deadline bool) (*agentv1.Envelope, error) {
		rctx := ctx
		if deadline {
			var rcancel context.CancelFunc
			rctx, rcancel = context.WithTimeout(ctx, ioTimeout)
			defer rcancel()
		}
		typ, frame, err := ws.Read(rctx)
		if err != nil {
			return nil, fmt.Errorf("read: %w", err)
		}
		if typ != websocket.MessageBinary {
			return nil, fmt.Errorf("read: %w: text frame", protocol.ErrMalformed)
		}
		return protocol.Unmarshal(frame)
	}

	hello := c.cfg.Hello(ctx)
	c.cfg.Clock.Reset()
	if err := write(&agentv1.Envelope{Body: &agentv1.Envelope_AgentHello{AgentHello: hello}}); err != nil {
		return err
	}
	env, err := read(true)
	if err != nil {
		return fmt.Errorf("waiting for ControlHello: %w", err)
	}
	body, err := verifier.Open(env)
	if err != nil {
		c.badSigs.Add(1)
		return fmt.Errorf("ControlHello: %w", err)
	}
	ch := body.GetControlHello()
	if ch == nil {
		return fmt.Errorf("expected ControlHello, got %T: %w", body.GetBody(), protocol.ErrMalformed)
	}
	c.cfg.Clock.Observe(ch.GetServerTimeMs())
	if !ch.GetAccepted() {
		_ = ws.Close(websocket.StatusNormalClosure, "rejected")
		return &RejectedError{Reason: ch.GetRejectReason()}
	}
	c.online.Store(true)
	h.OnControlHello(ctx, ch)
	h.OnState("online", nil)

	errc := make(chan error, 2)
	go func() { errc <- c.writer(ctx, ws, write) }()
	go func() {
		for {
			env, err := read(false)
			if err != nil {
				errc <- err
				return
			}
			body, err := verifier.Open(env)
			if errors.Is(err, ErrBadSequence) {
				c.cfg.Log.Warn("the control plane skipped or repeated a message; reconnecting", "err", err)
				_ = ws.Close(CloseBadSequence, "bad_sequence")
				errc <- err
				return
			}
			if err != nil {
				c.badSigs.Add(1)
				c.cfg.Log.Warn("dropped a message that failed verification", "err", err)
				continue
			}
			h.OnMessage(ctx, body)
		}
	}()
	err = <-errc
	switch websocket.CloseStatus(err) {
	case CloseSuperseded:
		return fmt.Errorf("another connection for this server replaced this one: %w", err)
	case CloseRevoked:
		return fmt.Errorf("the server was removed: %w", err)
	}
	return err
}

func (c *Client) writer(ctx context.Context, ws *websocket.Conn, write func(*agentv1.Envelope) error) error {
	ping := time.NewTicker(pingInterval)
	defer ping.Stop()
	for {
		for {
			body := c.queue.Pop()
			if body == nil {
				break
			}
			if err := write(body); err != nil {
				return err
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-c.queue.Ready():
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, ioTimeout)
			err := ws.Ping(pctx)
			cancel()
			if err != nil {
				return fmt.Errorf("ping: %w", err)
			}
		}
	}
}
