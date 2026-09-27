// Package conn keeps the agent's single outbound WebSocket to the control
// plane: dial with the server credential, sign and verify every envelope,
// enforce sequence numbers, a bounded send queue, pings, and jittered
// exponential reconnects (PHASE-02 §4.4).
package conn

import (
	"math/rand/v2"
	"time"
)

// Backoff schedule: 1 s → 2 → 4 → 8 → 16 → 30 s cap, ±20 % jitter, reset
// after 60 s of stable connection.
var steps = []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 30 * time.Second}

// StableAfter is how long a connection must last before backoff resets.
const StableAfter = 60 * time.Second

// Backoff yields reconnect delays.
type Backoff struct {
	attempt int
	// Rand returns a float in [0,1); replaced in tests.
	Rand func() float64
}

// Next returns the delay before the next attempt and the un-jittered step
// (used to log once per step).
func (b *Backoff) Next() (delay, step time.Duration) {
	i := min(b.attempt, len(steps)-1)
	b.attempt++
	step = steps[i]
	r := rand.Float64 //nolint:gosec // jitter, not security
	if b.Rand != nil {
		r = b.Rand
	}
	jitter := 0.8 + 0.4*r() // ±20 %
	return time.Duration(float64(step) * jitter), step
}

// Reset starts the schedule over.
func (b *Backoff) Reset() { b.attempt = 0 }

// Connected is called when a connection ends; it resets the schedule when
// the connection lasted at least StableAfter.
func (b *Backoff) Connected(lasted time.Duration) {
	if lasted >= StableAfter {
		b.Reset()
	}
}
