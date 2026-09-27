// Package minisign verifies (and, for release tooling and tests, creates)
// minisign signatures: Ed25519 over the BLAKE2b-512 hash of the file ("ED",
// the default since minisign 0.8) or over the raw file (legacy "Ed"), plus
// the global signature over the trusted comment. The installer verifies the
// same files with openssl, so the formats must stay standard.
package minisign

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/blake2b"
)

// ErrInvalid is returned for every verification failure.
var ErrInvalid = errors.New("minisign: signature is invalid")

const (
	algLegacy    = "Ed"
	algPrehashed = "ED"
)

// PublicKey is a parsed minisign public key.
type PublicKey struct {
	KeyID [8]byte
	Key   ed25519.PublicKey
}

// ParsePublicKey accepts the base64 key line, or a whole .pub file.
func ParsePublicKey(s string) (*PublicKey, error) {
	line := strings.TrimSpace(s)
	if strings.Contains(line, "\n") {
		parts := strings.Split(line, "\n")
		line = strings.TrimSpace(parts[len(parts)-1])
	}
	raw, err := base64.StdEncoding.DecodeString(line)
	if err != nil || len(raw) != 2+8+ed25519.PublicKeySize || string(raw[:2]) != algLegacy {
		return nil, fmt.Errorf("minisign: malformed public key: %w", ErrInvalid)
	}
	pk := &PublicKey{Key: ed25519.PublicKey(raw[10:])}
	copy(pk.KeyID[:], raw[2:10])
	return pk, nil
}

// String returns the base64 key line.
func (p *PublicKey) String() string {
	raw := make([]byte, 0, 42)
	raw = append(raw, algLegacy...)
	raw = append(raw, p.KeyID[:]...)
	raw = append(raw, p.Key...)
	return base64.StdEncoding.EncodeToString(raw)
}

// Verify checks sigFile (the text of a .minisig) over data with pub.
func Verify(pub *PublicKey, sigFile string, data []byte) error {
	lines := strings.Split(strings.ReplaceAll(strings.TrimRight(sigFile, "\n"), "\r\n", "\n"), "\n")
	if len(lines) < 4 || !strings.HasPrefix(lines[0], "untrusted comment:") ||
		!strings.HasPrefix(lines[2], "trusted comment: ") {
		return fmt.Errorf("minisign: malformed signature file: %w", ErrInvalid)
	}
	sigRaw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(lines[1]))
	if err != nil || len(sigRaw) != 2+8+ed25519.SignatureSize {
		return fmt.Errorf("minisign: malformed signature: %w", ErrInvalid)
	}
	alg, keyID, sig := string(sigRaw[:2]), sigRaw[2:10], sigRaw[10:]
	if !bytes.Equal(keyID, pub.KeyID[:]) {
		return fmt.Errorf("minisign: signed by a different key: %w", ErrInvalid)
	}
	var msg []byte
	switch alg {
	case algPrehashed:
		h := blake2b.Sum512(data)
		msg = h[:]
	case algLegacy:
		msg = data
	default:
		return fmt.Errorf("minisign: unknown algorithm %q: %w", alg, ErrInvalid)
	}
	if !ed25519.Verify(pub.Key, msg, sig) {
		return ErrInvalid
	}
	trusted := strings.TrimPrefix(lines[2], "trusted comment: ")
	global, err := base64.StdEncoding.DecodeString(strings.TrimSpace(lines[3]))
	if err != nil || len(global) != ed25519.SignatureSize {
		return fmt.Errorf("minisign: malformed global signature: %w", ErrInvalid)
	}
	if !ed25519.Verify(pub.Key, append(append([]byte{}, sig...), trusted...), global) {
		return fmt.Errorf("minisign: trusted comment was altered: %w", ErrInvalid)
	}
	return nil
}

// SecretKey is an unencrypted signing key for release tooling and tests.
// Production release keys are kept offline; see docs/DECISIONS.md.
type SecretKey struct {
	KeyID [8]byte
	Key   ed25519.PrivateKey
}

// GenerateKey creates a new keypair with a random key id.
func GenerateKey() (*SecretKey, error) {
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("minisign: generate key: %w", err)
	}
	sk := &SecretKey{Key: priv}
	if _, err := rand.Read(sk.KeyID[:]); err != nil {
		return nil, fmt.Errorf("minisign: key id: %w", err)
	}
	return sk, nil
}

// Public returns the matching public key.
func (s *SecretKey) Public() *PublicKey {
	pub, _ := s.Key.Public().(ed25519.PublicKey)
	return &PublicKey{KeyID: s.KeyID, Key: pub}
}

// MarshalText encodes the secret key as "lumen-minisign-secret-v1 <base64(keyid||seed)>".
func (s *SecretKey) MarshalText() string {
	raw := append(append([]byte{}, s.KeyID[:]...), s.Key.Seed()...)
	return "lumen-minisign-secret-v1 " + base64.StdEncoding.EncodeToString(raw) + "\n"
}

// ParseSecretKey reverses MarshalText.
func ParseSecretKey(s string) (*SecretKey, error) {
	const prefix = "lumen-minisign-secret-v1 "
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, prefix) {
		return nil, errors.New("minisign: not a lumen secret key file")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(s, prefix))
	if err != nil || len(raw) != 8+ed25519.SeedSize {
		return nil, errors.New("minisign: malformed secret key")
	}
	sk := &SecretKey{Key: ed25519.NewKeyFromSeed(raw[8:])}
	copy(sk.KeyID[:], raw[:8])
	return sk, nil
}

// Sign returns a prehashed ("ED") .minisig file for data.
func Sign(sk *SecretKey, data []byte, trustedComment string) string {
	h := blake2b.Sum512(data)
	sig := ed25519.Sign(sk.Key, h[:])
	raw := append(append([]byte(algPrehashed), sk.KeyID[:]...), sig...)
	global := ed25519.Sign(sk.Key, append(append([]byte{}, sig...), trustedComment...))
	return "untrusted comment: signature from lumen release key\n" +
		base64.StdEncoding.EncodeToString(raw) + "\n" +
		"trusted comment: " + trustedComment + "\n" +
		base64.StdEncoding.EncodeToString(global) + "\n"
}
