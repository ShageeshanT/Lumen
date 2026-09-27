package minisign

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"strings"
	"testing"
)

func TestSignVerify(t *testing.T) {
	t.Parallel()
	sk, err := GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	data := []byte("lumen-agent binary bytes")
	sig := Sign(sk, data, "timestamp:1 file:lumen-agent-linux-amd64")

	pub, err := ParsePublicKey(sk.Public().String())
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(pub, sig, data); err != nil {
		t.Fatalf("verify: %v", err)
	}
	// A whole .pub file parses too.
	if _, err := ParsePublicKey("untrusted comment: minisign public key\n" + sk.Public().String() + "\n"); err != nil {
		t.Fatal(err)
	}

	if err := Verify(pub, sig, append(data, '!')); !errors.Is(err, ErrInvalid) {
		t.Fatalf("tampered data: %v", err)
	}
	lines := strings.Split(sig, "\n")
	lines[2] = "trusted comment: something else"
	if err := Verify(pub, strings.Join(lines, "\n"), data); !errors.Is(err, ErrInvalid) {
		t.Fatalf("tampered trusted comment: %v", err)
	}
	other, err := GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(other.Public(), sig, data); !errors.Is(err, ErrInvalid) {
		t.Fatalf("other key: %v", err)
	}
	if err := Verify(pub, "garbage", data); !errors.Is(err, ErrInvalid) {
		t.Fatalf("garbage: %v", err)
	}
}

func TestLegacyAlgorithm(t *testing.T) {
	t.Parallel()
	sk, err := GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	data := []byte("legacy")
	sig := ed25519.Sign(sk.Key, data)
	raw := append(append([]byte("Ed"), sk.KeyID[:]...), sig...)
	global := ed25519.Sign(sk.Key, append(append([]byte{}, sig...), "tc"...))
	file := "untrusted comment: x\n" + base64.StdEncoding.EncodeToString(raw) + "\ntrusted comment: tc\n" +
		base64.StdEncoding.EncodeToString(global) + "\n"
	if err := Verify(sk.Public(), file, data); err != nil {
		t.Fatalf("legacy verify: %v", err)
	}
}

func TestSecretKeyRoundTrip(t *testing.T) {
	t.Parallel()
	sk, err := GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	back, err := ParseSecretKey(sk.MarshalText())
	if err != nil {
		t.Fatal(err)
	}
	if back.KeyID != sk.KeyID || !back.Key.Equal(sk.Key) {
		t.Fatal("secret key round trip mismatch")
	}
	if _, err := ParseSecretKey("nope"); err == nil {
		t.Fatal("expected error")
	}
	if _, err := ParsePublicKey("bm9wZQ=="); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad public key: %v", err)
	}
}
