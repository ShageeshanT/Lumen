// Package version exposes build information injected at link time by
// scripts/build-go.sh.
package version

import (
	"fmt"
	"runtime"
)

// Set with -ldflags "-X .../internal/version.Version=..." at build time.
var (
	Version   = "0.0.0-dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

// String renders "<name> <version> (<commit>, <date>, <os>/<arch>)".
func String(name string) string {
	return fmt.Sprintf("%s %s (%s, %s, %s/%s)", name, Version, Commit, BuildDate, runtime.GOOS, runtime.GOARCH)
}
