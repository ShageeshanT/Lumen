// Package heartbeat sends a Heartbeat every interval (10 s by default) with
// the Docker and Caddy probe results, and re-runs the Caddy bootstrap so a
// proxy container removed by hand comes back within one heartbeat.
package heartbeat

import (
	"context"
	"time"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// Probe is the health snapshot a heartbeat carries.
type Probe struct {
	DockerOK       bool
	CaddyOK        bool
	ContainerCount uint32
}

// Loop drives heartbeats.
type Loop struct {
	// Interval returns the current interval (the control plane may change it).
	Interval func() time.Duration
	// Probe checks Docker and Caddy (and repairs Caddy when it can).
	Probe func(ctx context.Context) Probe
	// Online reports whether the connection is up; heartbeats are only sent then.
	Online func() bool
	// Send queues the heartbeat.
	Send func(*agentv1.Heartbeat)
	// Observe receives every probe result (status file, update health watch).
	Observe func(Probe)
	NewOpID func() string
	NowMs   func() int64
	// DesiredStateVersion is 0 until Phase 03.
	DesiredStateVersion func() uint64
	// Kick triggers an immediate heartbeat (sent on every new connection so
	// the server turns online without waiting a full interval). May be nil.
	Kick <-chan struct{}
}

// Build returns a heartbeat for p.
func (l *Loop) Build(p Probe) *agentv1.Heartbeat {
	var dsv uint64
	if l.DesiredStateVersion != nil {
		dsv = l.DesiredStateVersion()
	}
	return &agentv1.Heartbeat{
		Meta:                       &agentv1.Meta{OpId: l.NewOpID(), TimestampMs: l.NowMs()},
		DesiredStateVersionApplied: dsv,
		ContainerCount:             p.ContainerCount,
		DockerOk:                   p.DockerOK,
		CaddyOk:                    p.CaddyOK,
	}
}

// Run probes immediately, then every interval, until ctx is done. Probes run
// even while offline so local status and Caddy repair keep working when the
// control plane is unreachable.
func (l *Loop) Run(ctx context.Context) {
	for {
		p := l.Probe(ctx)
		if l.Observe != nil {
			l.Observe(p)
		}
		if l.Online() {
			l.Send(l.Build(p))
		}
		select {
		case <-ctx.Done():
			return
		case <-l.Kick:
		case <-time.After(l.Interval()):
		}
	}
}
