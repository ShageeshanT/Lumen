package join

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

// fakeCP implements /agent/v1/join and /agent/v1/credential with single-use tokens.
type fakeCP struct {
	mu        sync.Mutex
	tokens    map[string]bool // token -> used
	creds     map[string]string
	keys      map[string]string
	nextID    int
	cpPub     ed25519.PublicKey
	joinCalls int
}

func newFakeCP(tokens ...string) *fakeCP {
	pub, _, _ := ed25519.GenerateKey(nil)
	f := &fakeCP{tokens: map[string]bool{}, creds: map[string]string{}, keys: map[string]string{}, cpPub: pub}
	for _, t := range tokens {
		f.tokens[t] = false
	}
	return f
}

func (f *fakeCP) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch r.URL.Path {
	case "/agent/v1/join":
		f.joinCalls++
		var req struct {
			JoinToken string    `json:"join_token"`
			PublicKey string    `json:"public_key"`
			Host      HostFacts `json:"host"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		used, ok := f.tokens[req.JoinToken]
		if !ok || used {
			http.Error(w, `{"error":{"title":"Sign in to continue"}}`, http.StatusUnauthorized)
			return
		}
		f.tokens[req.JoinToken] = true
		f.nextID++
		id := fmt.Sprintf("srv_%026d", f.nextID)
		cred := "cred-" + id
		f.creds[id] = cred
		f.keys[id] = req.PublicKey
		_ = json.NewEncoder(w).Encode(map[string]string{
			"server_id": id, "name": "oracle-1", "credential": cred,
			"control_plane_public_key": base64.StdEncoding.EncodeToString(f.cpPub),
		})
	case "/agent/v1/credential":
		id, cred, _ := strings.Cut(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), ".")
		if f.creds[id] == "" || f.creds[id] != cred {
			http.Error(w, "{}", http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"server_id": id, "name": "oracle-1"})
	default:
		http.NotFound(w, r)
	}
}

func (f *fakeCP) revoke(id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.creds, id)
}

func TestJoinLifecycle(t *testing.T) {
	t.Parallel()
	cp := newFakeCP("tok-1", "tok-2")
	srv := httptest.NewTLSServer(cp)
	defer srv.Close()
	s := state.New(t.TempDir())
	ctx := context.Background()
	opts := Options{ControlPlane: srv.URL, Token: "tok-1", Client: srv.Client(), Store: s, Facts: HostFacts{OS: "ubuntu"}}

	// Fresh join.
	res, err := Run(ctx, opts)
	if err != nil {
		t.Fatalf("fresh join: %v", err)
	}
	if res.AlreadyJoined || res.Name != "oracle-1" {
		t.Fatalf("result %+v", res)
	}
	id, err := s.LoadIdentity()
	if err != nil || id.ServerID != res.ServerID {
		t.Fatalf("identity %v %+v", err, id)
	}
	st, _ := s.LoadState()
	if st.CertFingerprint == "" || st.ControlPlaneWSURL != "wss://"+strings.TrimPrefix(srv.URL, "https://")+"/agent/v1" {
		t.Fatalf("state %+v", st)
	}
	if cp.keys[res.ServerID] != base64.StdEncoding.EncodeToString(id.PublicKey) {
		t.Fatal("control plane got a different public key")
	}

	// Re-running with a valid credential is a no-op (the used token is not even sent).
	calls := cp.joinCalls
	again, err := Run(ctx, opts)
	if err != nil || !again.AlreadyJoined || again.ServerID != res.ServerID || cp.joinCalls != calls {
		t.Fatalf("second join: %v %+v calls %d→%d", err, again, calls, cp.joinCalls)
	}

	// Revoked: the stored credential is rejected, the reused token fails.
	cp.revoke(res.ServerID)
	if _, err := Run(ctx, opts); !errors.Is(err, ErrTokenInvalid) {
		t.Fatalf("reused token: %v", err)
	}

	// Rejoin with a fresh token keeps the identity keypair.
	opts.Token = "tok-2"
	re, err := Run(ctx, opts)
	if err != nil || re.ServerID == res.ServerID {
		t.Fatalf("rejoin: %v %+v", err, re)
	}
	id2, _ := s.LoadIdentity()
	if !ed25519.PublicKey(id2.PublicKey).Equal(ed25519.PublicKey(id.PublicKey)) {
		t.Fatal("rejoin must reuse the identity")
	}
	if c, _ := s.LoadCredential(); c != "cred-"+re.ServerID {
		t.Fatalf("credential %q", c)
	}
}

func TestJoinErrors(t *testing.T) {
	t.Parallel()
	cp := newFakeCP()
	srv := httptest.NewTLSServer(cp)
	defer srv.Close()
	ctx := context.Background()
	s := state.New(t.TempDir())

	if _, err := Run(ctx, Options{ControlPlane: srv.URL, Token: "unknown", Client: srv.Client(), Store: s}); !errors.Is(err, ErrTokenInvalid) {
		t.Fatalf("unknown token: %v", err)
	}
	// The identity was written before the request.
	if _, err := s.LoadIdentity(); err != nil {
		t.Fatalf("identity must exist after a failed join: %v", err)
	}
	if _, err := Run(ctx, Options{ControlPlane: srv.URL, Token: "", Client: srv.Client(), Store: s}); !errors.Is(err, ErrTokenInvalid) {
		t.Fatalf("empty token: %v", err)
	}
	closed := httptest.NewTLSServer(cp)
	url := closed.URL
	closed.Close()
	if _, err := Run(ctx, Options{ControlPlane: url, Token: "x", Client: srv.Client(), Store: state.New(t.TempDir())}); !errors.Is(err, ErrUnreachable) {
		t.Fatalf("unreachable: %v", err)
	}
	if _, err := Run(ctx, Options{ControlPlane: "http://cp.example.com", Token: "x", Client: srv.Client(), Store: s}); err == nil {
		t.Fatal("plain http must be refused")
	}
	if _, _, err := CheckCredential(ctx, srv.Client(), state.New(t.TempDir())); !errors.Is(err, state.ErrNotFound) {
		t.Fatalf("check without state: %v", err)
	}
}

func TestEnsureIdentityDetectsCorruption(t *testing.T) {
	t.Parallel()
	s := state.New(t.TempDir())
	if err := s.SaveIdentity(&state.Identity{PublicKey: []byte{1}, PrivateKey: []byte{2}}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := EnsureIdentity(s); err == nil {
		t.Fatal("corrupt identity accepted")
	}
}
