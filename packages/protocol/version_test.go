package protocol

import (
	"os"
	"strconv"
	"strings"
	"testing"
)

func TestProtocolVersionMatchesFile(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile("PROTOCOL_VERSION")
	if err != nil {
		t.Fatalf("read PROTOCOL_VERSION: %v", err)
	}
	fromFile, err := strconv.ParseUint(strings.TrimSpace(string(raw)), 10, 32)
	if err != nil {
		t.Fatalf("parse PROTOCOL_VERSION: %v", err)
	}
	if uint32(fromFile) != ProtocolVersion {
		t.Fatalf("PROTOCOL_VERSION file says %d, code says %d", fromFile, ProtocolVersion)
	}
}
