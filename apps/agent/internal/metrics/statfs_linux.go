//go:build linux

package metrics

import (
	"fmt"
	"syscall"
)

// Statfs returns usage for the filesystem holding path.
func Statfs(path string) (DiskUsage, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return DiskUsage{}, fmt.Errorf("statfs %s: %w", path, err)
	}
	bs := uint64(st.Bsize) //nolint:gosec // block size is positive
	return DiskUsage{
		Total:      st.Blocks * bs,
		Free:       st.Bfree * bs,
		Avail:      st.Bavail * bs,
		InodesFree: st.Ffree,
	}, nil
}
