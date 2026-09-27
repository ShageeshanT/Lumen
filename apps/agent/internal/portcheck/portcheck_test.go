package portcheck

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

func TestLookupFromFixtures(t *testing.T) {
	t.Parallel()
	root := filepath.Join("testdata", "proc")
	cases := map[uint32]bool{80: true, 443: true, 2019: true, 53: true, 8080: false, 22: false}
	for port, want := range cases {
		l, err := Lookup(root, port)
		if err != nil {
			t.Fatalf("%d: %v", port, err)
		}
		if l.Listening != want {
			t.Errorf("port %d listening=%v, want %v", port, l.Listening, want)
		}
	}
}

func TestLookupResolvesOwner(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs symlinks shaped like /proc/<pid>/fd")
	}
	t.Parallel()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "net"), 0o750); err != nil {
		t.Fatal(err)
	}
	src, err := os.ReadFile(filepath.Join("testdata", "proc", "net", "tcp"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "net", "tcp"), src, 0o600); err != nil { //nolint:gosec // test temp dir
		t.Fatal(err)
	}
	fd := filepath.Join(root, "4242", "fd")
	if err := os.MkdirAll(fd, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("socket:[22001]", filepath.Join(fd, "7")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "4242", "comm"), []byte("caddy\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	l, err := Lookup(root, 80)
	if err != nil || !l.Listening || l.Process != "caddy" {
		t.Fatalf("got %+v %v", l, err)
	}
}

type fakeAdmin struct {
	mu       sync.Mutex
	inserted []string
	deleted  []string
}

func (f *fakeAdmin) InsertRoute(_ context.Context, server string, route any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	m, _ := route.(map[string]any)
	id, _ := m["@id"].(string)
	f.inserted = append(f.inserted, server+"/"+id)
	return nil
}

func (f *fakeAdmin) DeleteID(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, id)
	return nil
}

type fakeProxy struct{ restarts int }

func (p *fakeProxy) Restart(context.Context) error { p.restarts++; return nil }

func TestResponderInstallsAndRemovesRoutes(t *testing.T) {
	t.Parallel()
	admin := &fakeAdmin{}
	proxy := &fakeProxy{}
	r := &Responder{
		ProcRoot: filepath.Join("testdata", "proc"),
		Admin:    admin, Proxy: proxy,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		TTL: 50 * time.Millisecond, Settle: time.Millisecond,
	}
	res, err := r.Handle(context.Background(), &agentv1.PortCheck{
		Meta:  &agentv1.Meta{OpId: "op-1"},
		Ports: []uint32{80, 443, 8080},
		Nonce: "abcdefgh12345678",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.GetOpId() != "op-1" || len(res.GetPorts()) != 3 {
		t.Fatalf("result %+v", res)
	}
	if !res.GetPorts()[0].GetNonceRouteInstalled() || !res.GetPorts()[1].GetNonceRouteInstalled() {
		t.Fatalf("routes not installed: %+v", res.GetPorts())
	}
	if res.GetPorts()[2].GetListening() || res.GetPorts()[2].GetNonceRouteInstalled() {
		t.Fatalf("8080 must be not listening without a route: %+v", res.GetPorts()[2])
	}
	if proxy.restarts != 0 {
		t.Fatal("8080 is not a web port; no restart expected")
	}
	if r.Pending() != 2 {
		t.Fatalf("pending %d", r.Pending())
	}
	deadline := time.Now().Add(2 * time.Second)
	for r.Pending() > 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if r.Pending() != 0 {
		t.Fatal("routes were not removed after the TTL")
	}
}

func TestResponderRestartsProxyOnce(t *testing.T) {
	t.Parallel()
	empty := t.TempDir()
	if err := os.MkdirAll(filepath.Join(empty, "net"), 0o750); err != nil {
		t.Fatal(err)
	}
	proxy := &fakeProxy{}
	r := &Responder{
		ProcRoot: empty, Admin: &fakeAdmin{}, Proxy: proxy,
		Log:    slog.New(slog.NewTextHandler(io.Discard, nil)),
		Settle: time.Millisecond,
	}
	res, err := r.Handle(context.Background(), &agentv1.PortCheck{Meta: &agentv1.Meta{OpId: "op"}, Ports: []uint32{80, 443}, Nonce: "abcdefgh"})
	if err != nil {
		t.Fatal(err)
	}
	if proxy.restarts != 1 {
		t.Fatalf("restarts %d, want exactly 1", proxy.restarts)
	}
	for _, p := range res.GetPorts() {
		if p.GetListening() || p.GetNonceRouteInstalled() {
			t.Fatalf("unexpected %+v", p)
		}
	}
}

func TestResponderRejectsBadInput(t *testing.T) {
	t.Parallel()
	r := &Responder{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if _, err := r.Handle(context.Background(), &agentv1.PortCheck{Ports: []uint32{80}, Nonce: "../x"}); err == nil {
		t.Fatal("bad nonce accepted")
	}
	if _, err := r.Handle(context.Background(), &agentv1.PortCheck{Nonce: "abcdefgh"}); err == nil {
		t.Fatal("no ports accepted")
	}
}
