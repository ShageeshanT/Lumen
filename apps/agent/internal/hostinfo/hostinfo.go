// Package hostinfo gathers the host facts sent at join and in AgentHello.
package hostinfo

import (
	"bufio"
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/buildinfo"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/docker"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/join"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/metrics"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/provider"
)

// Sources lets tests replace the filesystem roots.
type Sources struct {
	OSRelease string // default /etc/os-release
	ProcRoot  string // default /proc
}

// ParseOSRelease returns ID and VERSION_ID from an os-release file.
func ParseOSRelease(path string) (id, version string) {
	f, err := os.Open(path) //nolint:gosec // fixed system path
	if err != nil {
		return runtime.GOOS, ""
	}
	defer func() { _ = f.Close() }()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), "=")
		if !ok {
			continue
		}
		v = strings.Trim(v, `"'`)
		switch k {
		case "ID":
			id = v
		case "VERSION_ID":
			version = v
		}
	}
	if id == "" {
		id = runtime.GOOS
	}
	return id, version
}

// Gather collects facts; slow sources are bounded by ctx. prov is the
// provider detection result (it may carry a public IP).
func Gather(ctx context.Context, src Sources, dc *docker.Client, prov provider.Result) join.HostFacts {
	if src.OSRelease == "" {
		src.OSRelease = "/etc/os-release"
	}
	if src.ProcRoot == "" {
		src.ProcRoot = "/proc"
	}
	id, ver := ParseOSRelease(src.OSRelease)
	f := join.HostFacts{
		OS:              id,
		OSVersion:       ver,
		Arch:            runtime.GOARCH,
		CPUCores:        uint32(max(runtime.NumCPU(), 1)), //nolint:gosec // CPU count fits
		AgentVersion:    buildinfo.Version,
		ProtocolVersion: buildinfo.ProtocolVersion,
		Provider:        prov.Provider,
		RegionLabel:     prov.RegionLabel,
		PublicIP:        prov.PublicIP,
	}
	if ip := strings.TrimSpace(os.Getenv("LUMEN_PUBLIC_IP")); ip != "" {
		f.PublicIP = ip
	}
	if h, err := os.Hostname(); err == nil {
		f.Hostname = h
	}
	if k, err := os.ReadFile(filepath.Join(src.ProcRoot, "sys", "kernel", "osrelease")); err == nil { //nolint:gosec // /proc path
		f.Kernel = strings.TrimSpace(string(k))
	}
	if mf, err := os.Open(filepath.Join(src.ProcRoot, "meminfo")); err == nil { //nolint:gosec // /proc path
		if m, err := metrics.ParseMeminfo(mf); err == nil {
			f.MemoryBytes = m.Total
		}
		_ = mf.Close()
	}
	if u, err := metrics.Statfs("/"); err == nil {
		f.DiskBytes = u.Total
	}
	if dc != nil {
		dctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		if v, err := dc.Version(dctx); err == nil {
			f.DockerVersion = v.Version
		}
		cancel()
	}
	return f
}
