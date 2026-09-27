// Package metrics samples host metrics from /proc and statfs (no cgo, no
// third-party collector) and sends them every 10 s (PHASE-02 §4.9).
package metrics

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// DiskLowBytes is the free-space threshold below which disk_low is set and
// Phase 03 refuses builds (DISK_FULL).
const DiskLowBytes = 2 << 30

// DefaultMounts are the filesystems reported; missing ones are skipped.
var DefaultMounts = []string{"/", "/var/lib/lumen", "/var/lib/docker"}

// CPUTimes is the aggregate line of /proc/stat.
type CPUTimes struct{ Idle, Total uint64 }

// ParseProcStat reads the aggregate "cpu" line.
func ParseProcStat(r io.Reader) (CPUTimes, error) {
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) < 5 || f[0] != "cpu" {
			continue
		}
		var t CPUTimes
		for i, v := range f[1:] {
			n, err := strconv.ParseUint(v, 10, 64)
			if err != nil {
				return CPUTimes{}, fmt.Errorf("proc/stat field %d: %w", i, err)
			}
			// Fields: user nice system idle iowait irq softirq steal guest guest_nice.
			// guest and guest_nice are already counted in user and nice.
			if i >= 8 {
				break
			}
			t.Total += n
			if i == 3 || i == 4 {
				t.Idle += n
			}
		}
		return t, nil
	}
	return CPUTimes{}, fmt.Errorf("proc/stat: no cpu line")
}

// CPUPercent is the busy share between two readings, 0-100.
func CPUPercent(prev, cur CPUTimes) float64 {
	if cur.Total <= prev.Total {
		return 0
	}
	total := float64(cur.Total - prev.Total)
	idle := float64(cur.Idle - prev.Idle)
	p := (total - idle) / total * 100
	if p < 0 {
		return 0
	}
	return p
}

// Meminfo holds the fields of /proc/meminfo the sample needs, in bytes.
type Meminfo struct{ Total, Available, Free, Buffers, Cached, SwapTotal, SwapFree uint64 }

// ParseMeminfo parses /proc/meminfo (values in kB).
func ParseMeminfo(r io.Reader) (Meminfo, error) {
	var m Meminfo
	fields := map[string]*uint64{
		"MemTotal": &m.Total, "MemAvailable": &m.Available, "MemFree": &m.Free,
		"Buffers": &m.Buffers, "Cached": &m.Cached, "SwapTotal": &m.SwapTotal, "SwapFree": &m.SwapFree,
	}
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		dst, want := fields[k]
		if !want {
			continue
		}
		f := strings.Fields(v)
		if len(f) == 0 {
			continue
		}
		n, err := strconv.ParseUint(f[0], 10, 64)
		if err != nil {
			return m, fmt.Errorf("meminfo %s: %w", k, err)
		}
		*dst = n * 1024
	}
	if m.Total == 0 {
		return m, fmt.Errorf("meminfo: no MemTotal")
	}
	if m.Available == 0 { // kernels before 3.14
		m.Available = m.Free + m.Buffers + m.Cached
	}
	return m, nil
}

// ParseLoadavg returns the 1, 5 and 15 minute load averages.
func ParseLoadavg(r io.Reader) (l1, l5, l15 float64, err error) {
	b, err := io.ReadAll(io.LimitReader(r, 4096))
	if err != nil {
		return 0, 0, 0, fmt.Errorf("loadavg: %w", err)
	}
	f := strings.Fields(string(b))
	if len(f) < 3 {
		return 0, 0, 0, fmt.Errorf("loadavg: short line")
	}
	vals := make([]float64, 3)
	for i := range vals {
		if vals[i], err = strconv.ParseFloat(f[i], 64); err != nil {
			return 0, 0, 0, fmt.Errorf("loadavg: %w", err)
		}
	}
	return vals[0], vals[1], vals[2], nil
}

// ParseUptime returns whole seconds since boot.
func ParseUptime(r io.Reader) (uint64, error) {
	b, err := io.ReadAll(io.LimitReader(r, 4096))
	if err != nil {
		return 0, fmt.Errorf("uptime: %w", err)
	}
	f := strings.Fields(string(b))
	if len(f) == 0 {
		return 0, fmt.Errorf("uptime: empty")
	}
	v, err := strconv.ParseFloat(f[0], 64)
	if err != nil {
		return 0, fmt.Errorf("uptime: %w", err)
	}
	return uint64(v), nil
}

// ParseNetDev returns per-interface byte counters, skipping loopback and
// container veth/bridge interfaces.
func ParseNetDev(r io.Reader) ([]*agentv1.NetSample, error) {
	var out []*agentv1.NetSample
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		name, rest, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		name = strings.TrimSpace(name)
		if name == "lo" || strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "br-") {
			continue
		}
		f := strings.Fields(rest)
		if len(f) < 16 {
			continue
		}
		rx, err1 := strconv.ParseUint(f[0], 10, 64)
		tx, err2 := strconv.ParseUint(f[8], 10, 64)
		if err1 != nil || err2 != nil {
			return nil, fmt.Errorf("net/dev %s: bad counters", name)
		}
		out = append(out, &agentv1.NetSample{Iface: name, RxBytes: rx, TxBytes: tx})
	}
	return out, nil
}

// DiskUsage is one statfs result.
type DiskUsage struct{ Total, Free, Avail, InodesFree uint64 }

// Collector produces HostSamples.
type Collector struct {
	ProcRoot string
	Mounts   []string
	// Statfs is replaced in tests; defaults to the OS implementation.
	Statfs func(path string) (DiskUsage, error)
	// Now is replaced in tests.
	Now func() time.Time

	prev    CPUTimes
	hasPrev bool
}

func (c *Collector) open(name string) (*os.File, error) {
	root := c.ProcRoot
	if root == "" {
		root = "/proc"
	}
	f, err := os.Open(filepath.Join(root, name)) //nolint:gosec // fixed /proc paths
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	return f, nil
}

func (c *Collector) read(name string, fn func(io.Reader) error) error {
	f, err := c.open(name)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	return fn(f)
}

// Sample reads every source once. Individual source failures leave their
// fields zero rather than failing the whole sample.
func (c *Collector) Sample() (*agentv1.HostSample, []error) {
	now := time.Now
	if c.Now != nil {
		now = c.Now
	}
	statfs := c.Statfs
	if statfs == nil {
		statfs = Statfs
	}
	mounts := c.Mounts
	if mounts == nil {
		mounts = DefaultMounts
	}
	s := &agentv1.HostSample{TsMs: now().UnixMilli()}
	var errs []error

	if err := c.read("stat", func(r io.Reader) error {
		cur, err := ParseProcStat(r)
		if err != nil {
			return err
		}
		if c.hasPrev {
			s.CpuPercent = CPUPercent(c.prev, cur)
		}
		c.prev, c.hasPrev = cur, true
		return nil
	}); err != nil {
		errs = append(errs, err)
	}
	if err := c.read("meminfo", func(r io.Reader) error {
		m, err := ParseMeminfo(r)
		if err != nil {
			return err
		}
		s.MemTotal, s.MemAvailable = m.Total, m.Available
		s.MemUsed = m.Total - min(m.Available, m.Total)
		s.SwapTotal, s.SwapUsed = m.SwapTotal, m.SwapTotal-min(m.SwapFree, m.SwapTotal)
		return nil
	}); err != nil {
		errs = append(errs, err)
	}
	if err := c.read("loadavg", func(r io.Reader) (err error) {
		s.Load1, s.Load5, s.Load15, err = ParseLoadavg(r)
		return err
	}); err != nil {
		errs = append(errs, err)
	}
	if err := c.read("uptime", func(r io.Reader) (err error) {
		s.UptimeS, err = ParseUptime(r)
		return err
	}); err != nil {
		errs = append(errs, err)
	}
	if err := c.read("net/dev", func(r io.Reader) (err error) {
		s.Nets, err = ParseNetDev(r)
		return err
	}); err != nil {
		errs = append(errs, err)
	}
	for _, m := range mounts {
		if _, err := os.Stat(m); err != nil {
			continue
		}
		u, err := statfs(m)
		if err != nil {
			errs = append(errs, fmt.Errorf("statfs %s: %w", m, err))
			continue
		}
		s.Disks = append(s.Disks, &agentv1.DiskSample{
			Mount: m, Total: u.Total, Free: u.Avail, Used: u.Total - min(u.Free, u.Total), InodesFree: u.InodesFree,
		})
	}
	s.DiskLow = DiskLow(s.Disks)
	return s, errs
}

// DiskLow is true when /var/lib/lumen or /var/lib/docker (or "/" when neither
// exists as a separate mount) has less than DiskLowBytes free.
func DiskLow(disks []*agentv1.DiskSample) bool {
	watched := false
	for _, d := range disks {
		if d.GetMount() == "/var/lib/lumen" || d.GetMount() == "/var/lib/docker" {
			watched = true
			if d.GetFree() < DiskLowBytes {
				return true
			}
		}
	}
	if !watched {
		for _, d := range disks {
			if d.GetMount() == "/" && d.GetFree() < DiskLowBytes {
				return true
			}
		}
	}
	return false
}

// SelfRSS returns this process's resident set size from /proc/self/status.
func SelfRSS(procRoot string) uint64 {
	if procRoot == "" {
		procRoot = "/proc"
	}
	f, err := os.Open(filepath.Join(procRoot, "self", "status")) //nolint:gosec // /proc path
	if err != nil {
		var ms runtime.MemStats
		runtime.ReadMemStats(&ms)
		return ms.Sys
	}
	defer func() { _ = f.Close() }()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), "VmRSS:"); ok {
			fs := strings.Fields(v)
			if len(fs) > 0 {
				n, _ := strconv.ParseUint(fs[0], 10, 64)
				return n * 1024
			}
		}
	}
	return 0
}
