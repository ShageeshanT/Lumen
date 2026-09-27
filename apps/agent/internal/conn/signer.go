package conn

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ShageeshanT/Lumen/packages/protocol"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// ErrBadSequence means the peer repeated or skipped a sequence number.
var ErrBadSequence = errors.New("bad sequence")

// Clock tracks the offset between this host and the control plane so
// envelope timestamps use corrected time (PHASE-02 §4.4 clock skew).
type Clock struct {
	offsetMs atomic.Int64
	// Now is replaced in tests.
	Now func() time.Time
}

func (c *Clock) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

// Observe records the control plane's time as seen now.
func (c *Clock) Observe(serverTimeMs int64) {
	if serverTimeMs > 0 {
		c.offsetMs.Store(serverTimeMs - c.now().UnixMilli())
	}
}

// OffsetMs is control-plane time minus local time.
func (c *Clock) OffsetMs() int64 { return c.offsetMs.Load() }

// NowMs returns corrected milliseconds since the epoch.
func (c *Clock) NowMs() int64 { return c.now().UnixMilli() + c.offsetMs.Load() }

// Signer seals outgoing envelopes with a per-connection sequence.
type Signer struct {
	key      ed25519.PrivateKey
	serverID string
	clock    *Clock
	mu       sync.Mutex
	seq      uint64
}

// NewSigner returns a signer whose first envelope has seq 1.
func NewSigner(key ed25519.PrivateKey, serverID string, clock *Clock) *Signer {
	return &Signer{key: key, serverID: serverID, clock: clock}
}

// Seal signs body with the next sequence number. Callers must write sealed
// envelopes in the order Seal returns them (the writer goroutine does).
func (s *Signer) Seal(body *agentv1.Envelope) (*agentv1.Envelope, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	env, err := protocol.Seal(s.key, s.serverID, s.seq, s.clock.NowMs(), body)
	if err != nil {
		s.seq--
		return nil, fmt.Errorf("seal: %w", err)
	}
	return env, nil
}

// Verifier opens incoming envelopes and enforces seq = previous + 1.
type Verifier struct {
	key      ed25519.PublicKey
	serverID string
	last     uint64
}

// NewVerifier checks envelopes against the control plane's public key.
func NewVerifier(key ed25519.PublicKey, serverID string) *Verifier {
	return &Verifier{key: key, serverID: serverID}
}

// Open verifies signature, server id and sequence, and returns the body.
func (v *Verifier) Open(env *agentv1.Envelope) (*agentv1.Envelope, error) {
	body, err := protocol.Open(v.key, env)
	if err != nil {
		return nil, err
	}
	if env.GetServerId() != v.serverID {
		return nil, fmt.Errorf("envelope for %q on %q's connection: %w", env.GetServerId(), v.serverID, protocol.ErrBadSignature)
	}
	if env.GetSeq() != v.last+1 {
		return nil, fmt.Errorf("got seq %d after %d: %w", env.GetSeq(), v.last, ErrBadSequence)
	}
	v.last = env.GetSeq()
	return body, nil
}
