package metrics

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// Sampler takes a HostSample every interval and hands it to Send.
type Sampler struct {
	Collector *Collector
	// Interval returns the current interval (the control plane may change it).
	Interval func() time.Duration
	// Send delivers a batch; it must not block (the send queue drops metrics
	// first when full).
	Send func(*agentv1.MetricsBatch)
	// Self and Containers enrich the sample; both may be nil.
	Self       func() *agentv1.AgentSelf
	Containers func(ctx context.Context) uint32
	// NewOpID generates op ids.
	NewOpID func() string
	Log     *slog.Logger

	diskLow atomic.Bool
	last    atomic.Pointer[agentv1.HostSample]
}

// DiskLow reports the last computed disk_low flag.
func (s *Sampler) DiskLow() bool { return s.diskLow.Load() }

// Last returns the most recent sample, or nil.
func (s *Sampler) Last() *agentv1.HostSample { return s.last.Load() }

// Run samples until ctx is done. The first reading only primes the CPU
// counters; the first batch goes out one interval later.
func (s *Sampler) Run(ctx context.Context) {
	s.Collector.Sample()
	loggedErr := false
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(s.Interval()):
		}
		sample, errs := s.Collector.Sample()
		if len(errs) > 0 && !loggedErr {
			s.Log.Warn("some host metrics could not be read", "err", errs[0], "count", len(errs))
			loggedErr = true
		}
		if s.Containers != nil {
			sample.ContainerCount = s.Containers(ctx)
		}
		if s.Self != nil {
			sample.Self = s.Self()
		}
		if prev := s.diskLow.Swap(sample.GetDiskLow()); prev != sample.GetDiskLow() {
			if sample.GetDiskLow() {
				s.Log.Warn("disk space is low; builds will be refused until at least 2 GB is free")
			} else {
				s.Log.Info("disk space is back above 2 GB")
			}
		}
		s.last.Store(sample)
		s.Send(&agentv1.MetricsBatch{
			Meta:       &agentv1.Meta{OpId: s.NewOpID(), TimestampMs: sample.GetTsMs()},
			HostSample: sample,
		})
	}
}
