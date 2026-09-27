package heartbeat

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

func TestLoopSendsOnlyWhileOnlineAndOnKick(t *testing.T) {
	t.Parallel()
	var online atomic.Bool
	var mu sync.Mutex
	var sent []*agentv1.Heartbeat
	var probes atomic.Int32
	kick := make(chan struct{}, 1)
	l := &Loop{
		Interval: func() time.Duration { return time.Hour },
		Probe: func(context.Context) Probe {
			probes.Add(1)
			return Probe{DockerOK: true, CaddyOK: true, ContainerCount: 4}
		},
		Online:  online.Load,
		Send:    func(h *agentv1.Heartbeat) { mu.Lock(); sent = append(sent, h); mu.Unlock() },
		NewOpID: func() string { return "op" },
		NowMs:   func() int64 { return 42 },
		Kick:    kick,
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { l.Run(ctx); close(done) }()

	deadline := time.Now().Add(2 * time.Second)
	for probes.Load() < 1 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	online.Store(true)
	kick <- struct{}{}
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(sent)
		mu.Unlock()
		if n == 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	<-done
	mu.Lock()
	defer mu.Unlock()
	if len(sent) != 1 {
		t.Fatalf("sent %d heartbeats, want 1 (offline probe must not send)", len(sent))
	}
	h := sent[0]
	if !h.GetDockerOk() || !h.GetCaddyOk() || h.GetContainerCount() != 4 || h.GetMeta().GetOpId() != "op" || h.GetMeta().GetTimestampMs() != 42 {
		t.Fatalf("heartbeat %+v", h)
	}
}
