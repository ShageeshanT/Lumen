package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/minisign"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

func shaHex(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

func TestVerify(t *testing.T) {
	t.Parallel()
	sk, _ := minisign.GenerateKey()
	pub := sk.Public().String()
	data := []byte("binary")
	sig := minisign.Sign(sk, data, "file:lumen-agent")
	if err := Verify(data, shaHex(data), sig, pub); err != nil {
		t.Fatal(err)
	}
	tampered := []byte("binarY")
	cases := map[string]error{
		"sha mismatch": Verify(tampered, shaHex(data), sig, pub),
		"sig mismatch": Verify(tampered, shaHex(tampered), sig, pub),
		"bad sha":      Verify(data, "zz", sig, pub),
		"no key":       Verify(data, shaHex(data), sig, ""),
		"bad key":      Verify(data, shaHex(data), sig, "nope"),
	}
	for name, err := range cases {
		if !errors.Is(err, ErrVerifyFailed) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func newManager(t *testing.T, version string) (*Manager, string) {
	t.Helper()
	dir := t.TempDir()
	bin := filepath.Join(dir, "lumen-agent")
	if err := os.WriteFile(bin, []byte("old"), 0o700); err != nil { //nolint:gosec // test binary
		t.Fatal(err)
	}
	return &Manager{
		BinPath: bin, Store: state.New(filepath.Join(dir, "state")), Version: version,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Client: http.DefaultClient,
	}, dir
}

func TestOnStartConfirmAndProbation(t *testing.T) {
	t.Parallel()
	m, _ := newManager(t, "0.0.2")
	if d, err := m.OnStart(); err != nil || d != NoUpdate {
		t.Fatalf("no record: %v %v", d, err)
	}
	now := time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC)
	m.Now = func() time.Time { return now }
	if _, err := m.Store.UpdateState(func(s *state.State) {
		s.Update = &state.UpdateRecord{OpID: "op", From: "0.0.1", To: "0.0.2", Phase: "pending"}
	}); err != nil {
		t.Fatal(err)
	}
	if d, _ := m.OnStart(); d != WatchHealth {
		t.Fatalf("pending: %v", d)
	}
	res, err := m.Confirm()
	if err != nil || res == nil || !res.Success || res.OpID != "op" || res.RunningVersion != "0.0.2" {
		t.Fatalf("confirm: %v %+v", err, res)
	}
	if m.PendingResult() == nil {
		t.Fatal("result must wait for the control plane's ack")
	}
	if err := m.ResultSent("op"); err != nil || m.PendingResult() != nil {
		t.Fatal("result not cleared")
	}
	if d, _ := m.OnStart(); d != OnProbation {
		t.Fatalf("probation: %v", d)
	}
	now = now.Add(Probation + time.Second)
	if err := m.EndProbation(); err != nil {
		t.Fatal(err)
	}
	st, _ := m.Store.LoadState()
	if st.Update != nil {
		t.Fatal("record must be cleared after probation")
	}
}

func TestCrashLoopRollsBack(t *testing.T) {
	t.Parallel()
	m, dir := newManager(t, "0.0.2")
	if err := os.WriteFile(filepath.Join(dir, "lumen-agent.prev"), []byte("old-good"), 0o700); err != nil { //nolint:gosec // test binary
		t.Fatal(err)
	}
	if _, err := m.Store.UpdateState(func(s *state.State) {
		s.Update = &state.UpdateRecord{OpID: "op", From: "0.0.1", To: "0.0.2", Phase: "pending"}
	}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < MaxStarts; i++ {
		if d, _ := m.OnStart(); d != WatchHealth {
			t.Fatalf("start %d: %v", i, d)
		}
	}
	if d, err := m.OnStart(); d != RolledBack || err != nil {
		t.Fatalf("fourth start: %v %v", d, err)
	}
	b, _ := os.ReadFile(m.BinPath)
	if string(b) != "old-good" {
		t.Fatalf("binary not restored: %q", b)
	}
	r := m.PendingResult()
	if r == nil || r.Success || r.RunningVersion != "0.0.1" || !strings.HasPrefix(r.Error, CodeRolledBack) {
		t.Fatalf("result %+v", r)
	}
	// The restored old binary starts: no update in progress.
	old := &Manager{BinPath: m.BinPath, Store: m.Store, Version: "0.0.1", Log: m.Log}
	if d, _ := old.OnStart(); d != NoUpdate {
		t.Fatalf("old binary: %v", d)
	}
}

func TestGuardRestoresPreviousBinaryAfterRepeatedFailedStarts(t *testing.T) {
	t.Parallel()
	// The guard runs from the previous binary, so its own version is the old one.
	m, dir := newManager(t, "0.0.1")
	if err := os.WriteFile(m.BinPath, []byte("crashing-new"), 0o700); err != nil { //nolint:gosec // test binary
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "lumen-agent.prev"), []byte("old-good"), 0o700); err != nil { //nolint:gosec // test binary
		t.Fatal(err)
	}
	if rolled, err := m.Guard(); rolled || err != nil {
		t.Fatalf("no update in progress: %v %v", rolled, err)
	}
	if _, err := m.Store.UpdateState(func(s *state.State) {
		s.Update = &state.UpdateRecord{OpID: "op", From: "0.0.1", To: "0.0.3", Phase: "pending"}
	}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < GuardMaxStarts; i++ {
		if rolled, err := m.Guard(); rolled || err != nil {
			t.Fatalf("start %d: %v %v", i, rolled, err)
		}
	}
	rolled, err := m.Guard()
	if !rolled || err != nil {
		t.Fatalf("start %d must roll back: %v", GuardMaxStarts+1, err)
	}
	if b, _ := os.ReadFile(m.BinPath); string(b) != "old-good" {
		t.Fatalf("binary %q", b)
	}
	if b, _ := os.ReadFile(m.BinPath + ".failed"); string(b) != "crashing-new" {
		t.Fatalf("failed binary %q", b)
	}
	r := m.PendingResult()
	if r == nil || r.Success || r.RunningVersion != "0.0.1" || r.OpID != "op" {
		t.Fatalf("result %+v", r)
	}
}

func TestApplyRefusesTamperedAndSameVersion(t *testing.T) {
	t.Parallel()
	sk, _ := minisign.GenerateKey()
	good := []byte("new binary")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("tampered!!")) }))
	defer srv.Close()
	m, _ := newManager(t, "0.0.1")
	m.PublicKey = sk.Public().String()
	u := &agentv1.AgentUpdate{
		Meta: &agentv1.Meta{OpId: "op"}, Version: "0.0.2", Url: srv.URL + "/x",
		Sha256: shaHex(good), Signature: minisign.Sign(sk, good, "t"),
	}
	if err := m.Apply(context.Background(), u); !errors.Is(err, ErrVerifyFailed) {
		t.Fatalf("tampered: %v", err)
	}
	if b, _ := os.ReadFile(m.BinPath); string(b) != "old" {
		t.Fatal("running binary must be untouched")
	}
	u.Version = "0.0.1"
	if err := m.Apply(context.Background(), u); !errors.Is(err, ErrAlreadyRunning) {
		t.Fatalf("same version: %v", err)
	}
	u.Version, u.Url = "0.0.2", "http://example.com/x"
	if err := m.Apply(context.Background(), u); !errors.Is(err, ErrVerifyFailed) {
		t.Fatalf("plain http url: %v", err)
	}
}

// TestApplySwapsAfterTrial uses shell scripts as stand-in binaries.
func TestApplySwapsAfterTrial(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses shell scripts as binaries")
	}
	t.Parallel()
	sk, _ := minisign.GenerateKey()
	good := []byte("#!/bin/sh\nexit 0\n")
	bad := []byte("#!/bin/sh\necho boom; exit 7\n")
	serve := func(b []byte) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(b) }))
	}
	goodSrv, badSrv := serve(good), serve(bad)
	defer goodSrv.Close()
	defer badSrv.Close()

	m, _ := newManager(t, "0.0.1")
	m.PublicKey = sk.Public().String()
	m.TrialTimeout = 5 * time.Second
	badUpdate := &agentv1.AgentUpdate{Meta: &agentv1.Meta{OpId: "op-bad"}, Version: "0.0.3", Url: badSrv.URL,
		Sha256: shaHex(bad), Signature: minisign.Sign(sk, bad, "t")}
	var te *TrialError
	if err := m.Apply(context.Background(), badUpdate); !errors.As(err, &te) || !strings.Contains(te.Output, "boom") {
		t.Fatalf("bad build: %v", err)
	}
	if b, _ := os.ReadFile(m.BinPath); string(b) != "old" {
		t.Fatal("a failed trial must leave the running binary")
	}
	if _, err := os.Stat(m.BinPath + ".new"); !os.IsNotExist(err) {
		t.Fatal(".new must be removed")
	}

	goodUpdate := &agentv1.AgentUpdate{Meta: &agentv1.Meta{OpId: "op-good"}, Version: "0.0.2", Url: goodSrv.URL,
		Sha256: shaHex(good), Signature: minisign.Sign(sk, good, "t")}
	if err := m.Apply(context.Background(), goodUpdate); err != nil {
		t.Fatalf("good build: %v", err)
	}
	if b, _ := os.ReadFile(m.BinPath); string(b) != string(good) {
		t.Fatal("new binary not in place")
	}
	if b, _ := os.ReadFile(m.BinPath + ".prev"); string(b) != "old" {
		t.Fatal("previous binary not kept")
	}
	st, _ := m.Store.LoadState()
	if st.Update == nil || st.Update.Phase != "pending" || st.Update.To != "0.0.2" || st.Update.From != "0.0.1" {
		t.Fatalf("record %+v", st.Update)
	}
	// A duplicate delivery of the same op is a no-op.
	if err := m.Apply(context.Background(), goodUpdate); err != nil {
		t.Fatal(err)
	}
}
