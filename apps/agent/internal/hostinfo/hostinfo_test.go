package hostinfo

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/provider"
)

func TestGather(t *testing.T) {
	dir := t.TempDir()
	osr := filepath.Join(dir, "os-release")
	if err := os.WriteFile(osr, []byte("NAME=\"Ubuntu\"\nID=ubuntu\nVERSION_ID=\"24.04\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	proc := filepath.Join(dir, "proc")
	if err := os.MkdirAll(filepath.Join(proc, "sys", "kernel"), 0o750); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(proc, "sys", "kernel", "osrelease"), []byte("6.8.0-45-generic\n"), 0o600)
	_ = os.WriteFile(filepath.Join(proc, "meminfo"), []byte("MemTotal: 1024 kB\n"), 0o600)
	t.Setenv("LUMEN_PUBLIC_IP", "203.0.113.5")

	f := Gather(context.Background(), Sources{OSRelease: osr, ProcRoot: proc}, nil, provider.Result{Provider: "hetzner", RegionLabel: "fsn1", PublicIP: "5.6.7.8"})
	if f.OS != "ubuntu" || f.OSVersion != "24.04" || f.Kernel != "6.8.0-45-generic" || f.MemoryBytes != 1024*1024 {
		t.Fatalf("facts %+v", f)
	}
	if f.PublicIP != "203.0.113.5" || f.Provider != "hetzner" || f.RegionLabel != "fsn1" || f.CPUCores == 0 || f.ProtocolVersion != 1 {
		t.Fatalf("facts %+v", f)
	}
	id, _ := ParseOSRelease(filepath.Join(dir, "missing"))
	if id == "" {
		t.Fatal("missing os-release falls back to GOOS")
	}
}
