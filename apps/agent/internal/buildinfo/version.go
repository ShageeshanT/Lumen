// Package buildinfo exposes build information injected at link time by
// scripts/build-go.sh (-ldflags "-X .../internal/buildinfo.Version=...").
package buildinfo

import (
	"fmt"
	"runtime"

	"github.com/ShageeshanT/Lumen/packages/protocol"
)

// Set with -ldflags -X at build time.
var (
	Version   = "0.0.0-dev"
	Commit    = "unknown"
	BuildDate = "unknown"
	// ReleasePublicKey is the minisign public key (base64 line of the .pub
	// file) that signs agent releases. Self-update refuses binaries not signed
	// by it. Empty in development builds, which then refuse every update
	// unless LUMEN_RELEASE_PUBKEY is set in the environment.
	ReleasePublicKey = ""
)

// ProtocolVersion is the agent protocol version this build speaks.
const ProtocolVersion = protocol.ProtocolVersion

// String renders "lumen-agent <version> (<commit>, <date>, <os>/<arch>, protocol <n>)".
func String() string {
	return fmt.Sprintf("lumen-agent %s (%s, %s, %s/%s, protocol %d)",
		Version, Commit, BuildDate, runtime.GOOS, runtime.GOARCH, ProtocolVersion)
}
