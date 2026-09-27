//go:build !linux

package metrics

import "errors"

// Statfs is only implemented on Linux, where the agent runs; other platforms
// build so tests can run there.
func Statfs(string) (DiskUsage, error) {
	return DiskUsage{}, errors.New("statfs is only implemented on linux")
}
