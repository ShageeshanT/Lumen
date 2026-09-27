package metrics

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// Fixtures were captured from a WSL2 Ubuntu 24.04 host and from Debian 12 and
// Rocky Linux 9 containers (see docs/evidence/phase-02).
var hosts = []string{"ubuntu-24.04", "debian-12", "rocky-9"}

func TestParsersOnRealHosts(t *testing.T) {
	t.Parallel()
	for _, h := range hosts {
		c := &Collector{
			ProcRoot: filepath.Join("testdata", h),
			Mounts:   []string{"/"},
			Statfs: func(string) (DiskUsage, error) {
				return DiskUsage{Total: 100 << 30, Free: 60 << 30, Avail: 50 << 30, InodesFree: 1000}, nil
			},
			Now: func() time.Time { return time.UnixMilli(1790424000000) },
		}
		s, errs := c.Sample()
		if len(errs) != 0 {
			t.Fatalf("%s: %v", h, errs)
		}
		if s.GetMemTotal() == 0 || s.GetMemAvailable() == 0 || s.GetMemUsed() > s.GetMemTotal() {
			t.Errorf("%s: memory %+v", h, s)
		}
		if s.GetUptimeS() == 0 {
			t.Errorf("%s: uptime zero", h)
		}
		if len(s.GetNets()) == 0 {
			t.Errorf("%s: no interfaces", h)
		}
		for _, n := range s.GetNets() {
			if n.GetIface() == "lo" {
				t.Errorf("%s: loopback must be skipped", h)
			}
		}
		if s.GetCpuPercent() != 0 {
			t.Errorf("%s: first sample has no CPU delta", h)
		}
		if len(s.GetDisks()) != 1 || s.GetDisks()[0].GetFree() != 50<<30 || s.GetDisks()[0].GetUsed() != 40<<30 {
			t.Errorf("%s: disks %+v", h, s.GetDisks())
		}
		if s.GetDiskLow() {
			t.Errorf("%s: disk_low with 50 GB free", h)
		}
		if s.GetTsMs() != 1790424000000 {
			t.Errorf("%s: ts %d", h, s.GetTsMs())
		}
	}
}

func TestCPUPercent(t *testing.T) {
	t.Parallel()
	prev, err := ParseProcStat(strings.NewReader("cpu  100 0 100 800 0 0 0 0 0 0\n"))
	if err != nil {
		t.Fatal(err)
	}
	cur, err := ParseProcStat(strings.NewReader("cpu  150 0 150 900 0 0 0 0 0 0\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got := CPUPercent(prev, cur); got != 50 {
		t.Fatalf("got %v, want 50", got)
	}
	if CPUPercent(cur, prev) != 0 {
		t.Fatal("backwards counters must yield 0")
	}
	if _, err := ParseProcStat(strings.NewReader("intr 1 2 3\n")); err == nil {
		t.Fatal("missing cpu line must fail")
	}
}

func TestParserErrors(t *testing.T) {
	t.Parallel()
	if _, err := ParseMeminfo(strings.NewReader("Cached: 1 kB\n")); err == nil {
		t.Fatal("meminfo without MemTotal")
	}
	m, err := ParseMeminfo(strings.NewReader("MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 10 kB\nCached: 90 kB\n"))
	if err != nil || m.Available != 200*1024 {
		t.Fatalf("old-kernel available: %v %+v", err, m)
	}
	if _, _, _, err := ParseLoadavg(strings.NewReader("0.1")); err == nil {
		t.Fatal("short loadavg")
	}
	if _, err := ParseUptime(strings.NewReader("")); err == nil {
		t.Fatal("empty uptime")
	}
}

func TestDiskLow(t *testing.T) {
	t.Parallel()
	d := func(mount string, free uint64) *agentv1.DiskSample {
		return &agentv1.DiskSample{Mount: mount, Free: free}
	}
	cases := []struct {
		name  string
		disks []*agentv1.DiskSample
		want  bool
	}{
		{"all roomy", []*agentv1.DiskSample{d("/", 50<<30), d("/var/lib/docker", 50<<30)}, false},
		{"docker low", []*agentv1.DiskSample{d("/", 50<<30), d("/var/lib/docker", 1<<30)}, true},
		{"lumen low", []*agentv1.DiskSample{d("/var/lib/lumen", 2<<30-1)}, true},
		{"root low but watched mounts fine", []*agentv1.DiskSample{d("/", 1<<30), d("/var/lib/docker", 5<<30)}, false},
		{"only root, low", []*agentv1.DiskSample{d("/", 1<<30)}, true},
		{"exactly 2 GB", []*agentv1.DiskSample{d("/var/lib/docker", 2<<30)}, false},
	}
	for _, tc := range cases {
		if got := DiskLow(tc.disks); got != tc.want {
			t.Errorf("%s: got %v", tc.name, got)
		}
	}
}

func TestSamplerSendsAndFlagsDiskLow(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	free := uint64(50 << 30)
	var got []*agentv1.MetricsBatch
	s := &Sampler{
		Collector: &Collector{
			ProcRoot: filepath.Join("testdata", "ubuntu-24.04"),
			Mounts:   []string{os.TempDir()},
			Statfs: func(string) (DiskUsage, error) {
				mu.Lock()
				defer mu.Unlock()
				return DiskUsage{Total: 100 << 30, Avail: free, Free: free}, nil
			},
		},
		Interval:   func() time.Duration { return 10 * time.Millisecond },
		Send:       func(b *agentv1.MetricsBatch) { mu.Lock(); got = append(got, b); mu.Unlock() },
		Self:       func() *agentv1.AgentSelf { return &agentv1.AgentSelf{Goroutines: 3} },
		Containers: func(context.Context) uint32 { return 2 },
		NewOpID:    func() string { return "op" },
		Log:        slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	// A temp dir stands in for /; "/" alone decides disk_low when neither
	// watched mount is present, so rename the mount to "/" via Statfs only.
	s.Collector.Mounts = []string{"/"}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { s.Run(ctx); close(done) }()

	waitFor := func(cond func() bool) {
		deadline := time.Now().Add(2 * time.Second)
		for !cond() && time.Now().Before(deadline) {
			time.Sleep(5 * time.Millisecond)
		}
	}
	waitFor(func() bool { mu.Lock(); defer mu.Unlock(); return len(got) >= 1 })
	if s.DiskLow() {
		t.Fatal("disk_low set with 50 GB free")
	}
	mu.Lock()
	free = 1 << 30
	mu.Unlock()
	waitFor(s.DiskLow)
	cancel()
	<-done
	if !s.DiskLow() {
		t.Fatal("disk_low not set after free space dropped under 2 GB")
	}
	mu.Lock()
	defer mu.Unlock()
	b := got[0]
	if b.GetHostSample().GetContainerCount() != 2 || b.GetHostSample().GetSelf().GetGoroutines() != 3 || b.GetMeta().GetOpId() != "op" {
		t.Fatalf("batch %+v", b)
	}
	if s.Last() == nil {
		t.Fatal("last sample missing")
	}
}

func TestSelfRSSFallback(t *testing.T) {
	t.Parallel()
	if SelfRSS(t.TempDir()) == 0 {
		t.Fatal("fallback must report memory")
	}
}
