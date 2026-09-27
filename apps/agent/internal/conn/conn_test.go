package conn

import (
	"context"
	"crypto/ed25519"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/ShageeshanT/Lumen/packages/protocol"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

func TestBackoffSchedule(t *testing.T) {
	t.Parallel()
	b := Backoff{Rand: func() float64 { return 0.5 }} // no jitter
	want := []time.Duration{1, 2, 4, 8, 16, 30, 30}
	for i, w := range want {
		d, step := b.Next()
		if step != w*time.Second || d != w*time.Second {
			t.Fatalf("attempt %d: delay %v step %v, want %v", i, d, step, w*time.Second)
		}
	}
	b.Connected(59 * time.Second)
	if _, step := b.Next(); step != 30*time.Second {
		t.Fatal("a short connection must not reset the schedule")
	}
	b.Connected(StableAfter)
	if _, step := b.Next(); step != time.Second {
		t.Fatal("a stable connection resets the schedule")
	}
	lo := Backoff{Rand: func() float64 { return 0 }}
	hi := Backoff{Rand: func() float64 { return 0.999999 }}
	if d, _ := lo.Next(); d != 800*time.Millisecond {
		t.Fatalf("low jitter %v", d)
	}
	if d, _ := hi.Next(); d < 1199*time.Millisecond || d > 1200*time.Millisecond {
		t.Fatalf("high jitter %v", d)
	}
}

func TestSignerVerifierSequence(t *testing.T) {
	t.Parallel()
	pub, priv, _ := ed25519.GenerateKey(nil)
	clock := &Clock{Now: func() time.Time { return time.UnixMilli(1000) }}
	clock.Observe(6000)
	if clock.OffsetMs() != 5000 || clock.NowMs() != 6000 {
		t.Fatalf("offset %d now %d", clock.OffsetMs(), clock.NowMs())
	}
	s := NewSigner(priv, "srv_a", clock)
	v := NewVerifier(pub, "srv_a")
	ack := &agentv1.Envelope{Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: "x"}}}
	e1, _ := s.Seal(ack)
	e2, _ := s.Seal(ack)
	e3, _ := s.Seal(ack)
	if e1.GetSeq() != 1 || e2.GetSeq() != 2 || e1.GetTimestampMs() != 6000 {
		t.Fatalf("seq/ts %d %d %d", e1.GetSeq(), e2.GetSeq(), e1.GetTimestampMs())
	}
	if _, err := v.Open(e1); err != nil {
		t.Fatal(err)
	}
	if _, err := v.Open(e1); !errors.Is(err, ErrBadSequence) {
		t.Fatalf("repeat: %v", err)
	}
	if _, err := v.Open(e3); !errors.Is(err, ErrBadSequence) {
		t.Fatalf("gap: %v", err)
	}
	if _, err := v.Open(e2); err != nil {
		t.Fatal(err)
	}
	other := NewVerifier(pub, "srv_b")
	if _, err := other.Open(e1); !errors.Is(err, protocol.ErrBadSignature) {
		t.Fatalf("wrong server: %v", err)
	}
}

func body(op string) *agentv1.Envelope {
	return &agentv1.Envelope{Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: op}}}
}

func TestQueueDropsMetricsFirstAndNeverCritical(t *testing.T) {
	t.Parallel()
	q := NewQueue()
	for i := 0; i < QueueLimit-1; i++ {
		q.Push(body("n"), Normal)
	}
	q.Push(body("m"), Droppable)
	if q.Len() != QueueLimit {
		t.Fatal("queue should be full")
	}
	// Full: a critical push evicts the metric.
	if !q.Push(body("c1"), Critical) || q.Len() != QueueLimit || q.Dropped() != 1 {
		t.Fatalf("len %d dropped %d", q.Len(), q.Dropped())
	}
	// No metrics left: a droppable push is refused.
	if q.Push(body("m2"), Droppable) {
		t.Fatal("droppable accepted into a full queue")
	}
	// A normal push evicts the oldest normal.
	if !q.Push(body("n2"), Normal) || q.Len() != QueueLimit {
		t.Fatal("normal push should evict a normal")
	}
	// Fill with criticals: they are never refused, even over the limit.
	for i := 0; i < QueueLimit+5; i++ {
		if !q.Push(body("c"), Critical) {
			t.Fatal("critical refused")
		}
	}
	if q.Len() <= QueueLimit {
		t.Fatalf("criticals must be kept over the limit, len %d", q.Len())
	}
	if q.Pop() == nil {
		t.Fatal("pop")
	}
	q2 := NewQueue()
	q2.Push(body("m"), Droppable)
	q2.Push(body("c"), Critical)
	q2.DropDroppable()
	if q2.Len() != 1 || q2.Pop().GetAck().GetOpId() != "c" || q2.Pop() != nil {
		t.Fatal("DropDroppable")
	}
}

// fakeCP is a minimal control plane: it accepts one agent, answers the hello,
// echoes a HeartbeatAck for every heartbeat, and can misbehave on request.
type fakeCP struct {
	t        *testing.T
	key      ed25519.PrivateKey
	agentKey ed25519.PublicKey
	accept   bool
	// afterHello runs with a function that sends a sealed body with a given seq.
	afterHello func(send func(seq uint64, b *agentv1.Envelope, key ed25519.PrivateKey))
	mu         sync.Mutex
	got        []string
	authHeader string
}

func (f *fakeCP) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.authHeader = r.Header.Get("Authorization")
	f.mu.Unlock()
	if !strings.HasSuffix(f.authHeader, ".good-credential") {
		http.Error(w, "no", http.StatusUnauthorized)
		return
	}
	ws, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = ws.CloseNow() }()
	ctx := r.Context()
	var seq uint64
	send := func(s uint64, b *agentv1.Envelope, key ed25519.PrivateKey) {
		env, err := protocol.Seal(key, "srv_test", s, time.Now().UnixMilli(), b)
		if err != nil {
			f.t.Errorf("seal: %v", err)
			return
		}
		frame, _ := protocol.Marshal(env)
		_ = ws.Write(ctx, websocket.MessageBinary, frame)
	}
	for {
		_, frame, err := ws.Read(ctx)
		if err != nil {
			return
		}
		env, err := protocol.Unmarshal(frame)
		if err != nil {
			f.t.Errorf("unmarshal: %v", err)
			return
		}
		b, err := protocol.Open(f.agentKey, env)
		if err != nil {
			f.t.Errorf("agent envelope failed verification: %v", err)
			return
		}
		f.mu.Lock()
		f.got = append(f.got, string(b.ProtoReflect().WhichOneof(b.ProtoReflect().Descriptor().Oneofs().ByName("body")).Name()))
		f.mu.Unlock()
		switch x := b.GetBody().(type) {
		case *agentv1.Envelope_AgentHello:
			seq++
			send(seq, &agentv1.Envelope{Body: &agentv1.Envelope_ControlHello{ControlHello: &agentv1.ControlHello{
				Accepted: f.accept, RejectReason: map[bool]string{false: "CLOCK_SKEW"}[f.accept],
				ServerTimeMs: time.Now().UnixMilli(), NegotiatedProtocolVersion: 1,
			}}}, f.key)
			if f.accept && f.afterHello != nil {
				f.afterHello(func(s uint64, b *agentv1.Envelope, k ed25519.PrivateKey) { seq = s; send(s, b, k) })
			}
		case *agentv1.Envelope_Heartbeat:
			seq++
			send(seq, &agentv1.Envelope{Body: &agentv1.Envelope_HeartbeatAck{HeartbeatAck: &agentv1.HeartbeatAck{
				OpId: x.Heartbeat.GetMeta().GetOpId(), ServerTimeMs: time.Now().UnixMilli(),
			}}}, f.key)
		}
	}
}

type recorder struct {
	mu       sync.Mutex
	hellos   int
	messages []*agentv1.Envelope
	states   []string
}

func (r *recorder) OnControlHello(context.Context, *agentv1.ControlHello) {
	r.mu.Lock()
	r.hellos++
	r.mu.Unlock()
}

func (r *recorder) OnMessage(_ context.Context, b *agentv1.Envelope) {
	r.mu.Lock()
	r.messages = append(r.messages, b)
	r.mu.Unlock()
}

func (r *recorder) OnState(s string, _ error) {
	r.mu.Lock()
	r.states = append(r.states, s)
	r.mu.Unlock()
}

func (r *recorder) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.messages)
}

func newClient(t *testing.T, srv *httptest.Server, cpPub ed25519.PublicKey, agentKey ed25519.PrivateKey, cred string) *Client {
	t.Helper()
	return New(Config{
		URL:             "ws" + strings.TrimPrefix(srv.URL, "http"),
		ServerID:        "srv_test",
		Credential:      func() string { return cred },
		Identity:        agentKey,
		ControlPlaneKey: cpPub,
		Log:             slog.New(slog.NewTextHandler(io.Discard, nil)),
		Hello: func(context.Context) *agentv1.AgentHello {
			return &agentv1.AgentHello{ServerId: "srv_test", ProtocolVersion: protocol.ProtocolVersion}
		},
	})
}

func waitUntil(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("condition not met in time")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestClientHandshakeHeartbeatAndBadSignature(t *testing.T) {
	t.Parallel()
	cpPub, cpPriv, _ := ed25519.GenerateKey(nil)
	agentPub, agentPriv, _ := ed25519.GenerateKey(nil)
	_, evilPriv, _ := ed25519.GenerateKey(nil)
	f := &fakeCP{t: t, key: cpPriv, agentKey: agentPub, accept: true}
	f.afterHello = func(send func(uint64, *agentv1.Envelope, ed25519.PrivateKey)) {
		// A forged message (wrong key) is dropped and counted; the genuine
		// one with the same seq still arrives.
		send(2, &agentv1.Envelope{Body: &agentv1.Envelope_Revoke{Revoke: &agentv1.Revoke{Reason: "forged"}}}, evilPriv)
		send(2, &agentv1.Envelope{Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: "genuine"}}}, cpPriv)
	}
	srv := httptest.NewServer(f)
	defer srv.Close()

	c := newClient(t, srv, cpPub, agentPriv, "good-credential")
	rec := &recorder{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { c.Run(ctx, rec); close(done) }()

	waitUntil(t, c.Online)
	waitUntil(t, func() bool { return rec.count() >= 1 })
	if !c.Send(&agentv1.Envelope{Body: &agentv1.Envelope_Heartbeat{Heartbeat: &agentv1.Heartbeat{Meta: &agentv1.Meta{OpId: "hb1"}}}}, Normal) {
		t.Fatal("send refused while online")
	}
	waitUntil(t, func() bool { return rec.count() >= 2 })
	cancel()
	<-done

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if rec.hellos != 1 {
		t.Fatalf("hellos %d", rec.hellos)
	}
	if rec.messages[0].GetAck().GetOpId() != "genuine" {
		t.Fatalf("first message %v", rec.messages[0])
	}
	if rec.messages[1].GetHeartbeatAck().GetOpId() != "hb1" {
		t.Fatalf("second message %v", rec.messages[1])
	}
	if c.BadSignatures() != 1 {
		t.Fatalf("bad signatures %d, want 1", c.BadSignatures())
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.authHeader != "Bearer srv_test.good-credential" {
		t.Fatalf("auth header %q", f.authHeader)
	}
	if strings.Join(f.got, ",") != "agent_hello,heartbeat" {
		t.Fatalf("control plane saw %v", f.got)
	}
}

func TestClientReconnectsAfterBadSequenceAndRejection(t *testing.T) {
	t.Parallel()
	cpPub, cpPriv, _ := ed25519.GenerateKey(nil)
	agentPub, agentPriv, _ := ed25519.GenerateKey(nil)
	f := &fakeCP{t: t, key: cpPriv, agentKey: agentPub, accept: true}
	f.afterHello = func(send func(uint64, *agentv1.Envelope, ed25519.PrivateKey)) {
		send(5, &agentv1.Envelope{Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: "gap"}}}, cpPriv)
	}
	srv := httptest.NewServer(f)
	defer srv.Close()
	c := newClient(t, srv, cpPub, agentPriv, "good-credential")
	rec := &recorder{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { c.Run(ctx, rec); close(done) }()
	waitUntil(t, func() bool {
		rec.mu.Lock()
		defer rec.mu.Unlock()
		return len(rec.states) >= 3 // connecting, online, offline
	})
	cancel()
	<-done
	if rec.count() != 0 {
		t.Fatal("a message with a sequence gap must not be delivered")
	}

	// Unauthorized credential: Send while offline keeps only critical messages.
	bad := newClient(t, srv, cpPub, agentPriv, "wrong")
	if bad.Send(body("hb"), Normal) || !bad.Send(body("ack"), Critical) {
		t.Fatal("offline send policy")
	}
	err := bad.session(context.Background(), &recorder{})
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("got %v", err)
	}

	f2 := &fakeCP{t: t, key: cpPriv, agentKey: agentPub, accept: false}
	srv2 := httptest.NewServer(f2)
	defer srv2.Close()
	rej := newClient(t, srv2, cpPub, agentPriv, "good-credential")
	var re *RejectedError
	if err := rej.session(context.Background(), &recorder{}); !errors.As(err, &re) || re.Reason != "CLOCK_SKEW" {
		t.Fatalf("got %v", err)
	}
}
