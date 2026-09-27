// Package update replaces the agent binary when the control plane sends
// AgentUpdate, and rolls back when the new binary does not become healthy
// (PHASE-02 §4.10).
package update

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/minisign"
)

// ErrVerifyFailed is returned when the checksum or signature does not match
// (catalog code UPDATE_VERIFY_FAILED).
var ErrVerifyFailed = errors.New("UPDATE_VERIFY_FAILED")

// Verify checks data against the expected SHA-256 (hex) and the minisign
// signature made by the release key pubKey. The installer checks the same
// two things with openssl.
func Verify(data []byte, sha256Hex, sigFile, pubKey string) error {
	want, err := hex.DecodeString(strings.TrimSpace(strings.ToLower(sha256Hex)))
	if err != nil || len(want) != sha256.Size {
		return fmt.Errorf("%w: malformed sha256", ErrVerifyFailed)
	}
	got := sha256.Sum256(data)
	if subtle.ConstantTimeCompare(got[:], want) != 1 {
		return fmt.Errorf("%w: sha256 mismatch", ErrVerifyFailed)
	}
	if strings.TrimSpace(pubKey) == "" {
		return fmt.Errorf("%w: this agent build has no release key", ErrVerifyFailed)
	}
	pk, err := minisign.ParsePublicKey(pubKey)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrVerifyFailed, err)
	}
	if err := minisign.Verify(pk, sigFile, data); err != nil {
		return fmt.Errorf("%w: %w", ErrVerifyFailed, err)
	}
	return nil
}
