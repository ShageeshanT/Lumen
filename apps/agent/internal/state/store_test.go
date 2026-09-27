package state

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestRoundTripAndPermissions(t *testing.T) {
	t.Parallel()
	s := New(filepath.Join(t.TempDir(), "agent"))

	if _, err := s.LoadIdentity(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty identity: %v", err)
	}
	if _, err := s.LoadCredential(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty credential: %v", err)
	}
	st, err := s.LoadState()
	if err != nil || st.ServerID != "" {
		t.Fatalf("empty state: %v %+v", err, st)
	}

	if err := s.SaveIdentity(&Identity{PublicKey: []byte{1}, PrivateKey: []byte{2}}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveCredential("cred-value"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateState(func(st *State) { st.ServerID = "srv_x"; st.Update = &UpdateRecord{OpID: "op"} }); err != nil {
		t.Fatal(err)
	}

	id, err := s.LoadIdentity()
	if err != nil || id.PrivateKey[0] != 2 {
		t.Fatalf("identity: %v %+v", err, id)
	}
	c, err := s.LoadCredential()
	if err != nil || c != "cred-value" {
		t.Fatalf("credential: %v %q", err, c)
	}
	st, err = s.LoadState()
	if err != nil || st.ServerID != "srv_x" || st.Update.OpID != "op" {
		t.Fatalf("state: %v %+v", err, st)
	}

	if runtime.GOOS != "windows" {
		for _, name := range []string{"identity.json", "credential", "state.json"} {
			info, err := os.Stat(filepath.Join(s.Dir, name))
			if err != nil {
				t.Fatal(err)
			}
			if info.Mode().Perm() != 0o600 {
				t.Errorf("%s mode %o, want 0600", name, info.Mode().Perm())
			}
		}
		info, err := os.Stat(s.Dir)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o700 {
			t.Errorf("dir mode %o, want 0700", info.Mode().Perm())
		}
	}

	if err := s.DeleteCredential(); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteCredential(); err != nil {
		t.Fatalf("second delete: %v", err)
	}
	if _, err := s.LoadCredential(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("credential after delete: %v", err)
	}
	if _, err := s.LoadIdentity(); err != nil {
		t.Fatalf("identity must survive credential deletion: %v", err)
	}
}

func TestAtomicWriteLeavesNoTempFiles(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	p := filepath.Join(dir, "f")
	for i := 0; i < 3; i++ {
		if err := WriteFileAtomic(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one file, got %d", len(entries))
	}
}

func TestStatusRoundTrip(t *testing.T) {
	t.Parallel()
	s := New(t.TempDir())
	if _, err := s.ReadStatus(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty status: %v", err)
	}
	if err := s.WriteStatus(&Status{Connection: "online", DockerOK: true}); err != nil {
		t.Fatal(err)
	}
	st, err := s.ReadStatus()
	if err != nil || st.Connection != "online" || !st.DockerOK {
		t.Fatalf("status: %v %+v", err, st)
	}
}
