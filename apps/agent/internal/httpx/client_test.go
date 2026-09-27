package httpx

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestCheckControlPlaneURL(t *testing.T) {
	t.Parallel()
	ok := []string{"https://cp.example.com", "https://cp.example.com/", "http://127.0.0.1:4204", "http://localhost:4000"}
	for _, raw := range ok {
		if _, err := CheckControlPlaneURL(raw); err != nil {
			t.Errorf("%s: %v", raw, err)
		}
	}
	for _, raw := range []string{"http://cp.example.com", "ftp://x", "http://10.0.0.1"} {
		if _, err := CheckControlPlaneURL(raw); !errors.Is(err, ErrInsecureURL) {
			t.Errorf("%s: got %v", raw, err)
		}
	}
	if _, err := CheckControlPlaneURL("::nope"); err == nil {
		t.Error("expected parse error")
	}
}

func TestWebSocketURL(t *testing.T) {
	t.Parallel()
	u, _ := CheckControlPlaneURL("https://cp.example.com/")
	if got := WebSocketURL(u); got != "wss://cp.example.com/agent/v1" {
		t.Fatal(got)
	}
	u, _ = CheckControlPlaneURL("http://127.0.0.1:4204")
	if got := WebSocketURL(u); got != "ws://127.0.0.1:4204/agent/v1" {
		t.Fatal(got)
	}
}

func TestTLSConfigCAFile(t *testing.T) {
	t.Parallel()
	if _, err := TLSConfig(filepath.Join(t.TempDir(), "missing.pem")); err == nil {
		t.Fatal("missing file must fail")
	}
	bad := filepath.Join(t.TempDir(), "bad.pem")
	if err := os.WriteFile(bad, []byte("not pem"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := TLSConfig(bad); err == nil {
		t.Fatal("non-PEM file must fail")
	}
	if _, err := NewClient("", 0); err != nil {
		t.Fatal(err)
	}
	if PeerFingerprint(nil) != "" {
		t.Fatal("nil response has no fingerprint")
	}
}
