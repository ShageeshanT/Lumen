// Package portcheck answers PortCheck: which ports have a listener on the
// host (from /proc/net/tcp and tcp6) and a temporary Caddy route that proves
// from the outside that a request reaches this server's proxy.
package portcheck

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const stateListen = "0A"

// Listener describes who listens on a port.
type Listener struct {
	Port      uint32
	Listening bool
	// Process is the owning process name (from /proc/<pid>/comm) when readable.
	Process string
}

// parseProcNetTCP returns the socket inodes listening on port.
func parseProcNetTCP(r io.Reader, port uint32) ([]string, error) {
	var inodes []string
	sc := bufio.NewScanner(r)
	first := true
	for sc.Scan() {
		if first { // header line
			first = false
			continue
		}
		f := strings.Fields(sc.Text())
		if len(f) < 10 || f[3] != stateListen {
			continue
		}
		// local_address is HEXIP:HEXPORT.
		i := strings.LastIndex(f[1], ":")
		if i < 0 {
			continue
		}
		p, err := strconv.ParseUint(f[1][i+1:], 16, 16)
		if err != nil || uint32(p) != port {
			continue
		}
		inodes = append(inodes, f[9])
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return inodes, nil
}

// Lookup inspects procRoot (normally /proc) for a listener on port. The
// process name is best effort: sockets owned by processes in other PID
// namespaces or unreadable fds leave it empty.
func Lookup(procRoot string, port uint32) (Listener, error) {
	out := Listener{Port: port}
	var inodes []string
	for _, name := range []string{"tcp", "tcp6"} {
		f, err := os.Open(filepath.Join(procRoot, "net", name)) //nolint:gosec // fixed /proc paths
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return out, fmt.Errorf("portcheck: open %s: %w", name, err)
		}
		found, err := parseProcNetTCP(f, port)
		_ = f.Close()
		if err != nil {
			return out, fmt.Errorf("portcheck: %s: %w", name, err)
		}
		inodes = append(inodes, found...)
	}
	if len(inodes) == 0 {
		return out, nil
	}
	out.Listening = true
	out.Process = ownerOf(procRoot, inodes)
	return out, nil
}

// ownerOf walks /proc/<pid>/fd looking for socket:[inode].
func ownerOf(procRoot string, inodes []string) string {
	want := make(map[string]bool, len(inodes))
	for _, in := range inodes {
		want["socket:["+in+"]"] = true
	}
	pids, err := os.ReadDir(procRoot)
	if err != nil {
		return ""
	}
	for _, p := range pids {
		if _, err := strconv.Atoi(p.Name()); err != nil {
			continue
		}
		fdDir := filepath.Join(procRoot, p.Name(), "fd")
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}
		for _, fd := range fds {
			target, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil || !want[target] {
				continue
			}
			comm, err := os.ReadFile(filepath.Join(procRoot, p.Name(), "comm")) //nolint:gosec // /proc path
			if err != nil {
				return ""
			}
			return strings.TrimSpace(string(comm))
		}
	}
	return ""
}
