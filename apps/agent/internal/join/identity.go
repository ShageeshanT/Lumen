// Package join registers a server with the control plane: it creates the
// agent's Ed25519 identity, exchanges a single-use join token for a server
// credential, and stores both (PHASE-02 §4.3).
package join

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"fmt"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

// EnsureIdentity returns the stored identity, creating and persisting one
// first when none exists. It is written before any network call, so a crash
// can never lose a key the control plane already knows.
func EnsureIdentity(s *state.Store) (*state.Identity, bool, error) {
	id, err := s.LoadIdentity()
	if err == nil {
		if len(id.PrivateKey) != ed25519.PrivateKeySize || len(id.PublicKey) != ed25519.PublicKeySize {
			return nil, false, fmt.Errorf("identity.json is corrupt; remove %s/identity.json and join again", s.Dir)
		}
		return id, false, nil
	}
	if !errors.Is(err, state.ErrNotFound) {
		return nil, false, err
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, false, fmt.Errorf("generate identity: %w", err)
	}
	id = &state.Identity{PublicKey: pub, PrivateKey: priv}
	if err := s.SaveIdentity(id); err != nil {
		return nil, false, err
	}
	return id, true, nil
}
