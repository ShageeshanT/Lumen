package protocol

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

const fixturePath = "testdata/agent_hello.bin"

func sampleEnvelope() *agentv1.Envelope {
	return &agentv1.Envelope{
		OpId:      "op_01j8x9k2d3m4n5p6q7r8s9t0v1",
		Timestamp: timestamppb.New(time.Date(2026, time.September, 26, 12, 0, 0, 0, time.UTC)),
		Payload: &agentv1.Envelope_AgentHello{
			AgentHello: &agentv1.AgentHello{
				ServerId:        "srv_01j8x9k2d3m4n5p6q7r8s9t0v1",
				AgentVersion:    "0.0.0-dev",
				ProtocolVersion: ProtocolVersion,
				Os:              "linux",
				Arch:            "arm64",
				CpuCores:        4,
				MemoryBytes:     24 * 1024 * 1024 * 1024,
				DiskBytes:       200 * 1024 * 1024 * 1024,
				DockerVersion:   "28.1.1",
				PublicIp:        "203.0.113.10",
			},
		},
	}
}

// TestEnvelopeRoundTrip marshals the sample deterministically, writes the shared
// fixture that the TypeScript test reads, and checks the bytes decode back to
// an equal message.
func TestEnvelopeRoundTrip(t *testing.T) {
	t.Parallel()

	want := sampleEnvelope()
	encoded, err := proto.MarshalOptions{Deterministic: true}.Marshal(want)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if err := os.MkdirAll(filepath.Dir(fixturePath), 0o750); err != nil {
		t.Fatalf("mkdir testdata: %v", err)
	}
	if existing, readErr := os.ReadFile(fixturePath); readErr == nil {
		if !bytes.Equal(existing, encoded) {
			t.Fatalf("%s is stale; delete it and rerun the test to regenerate", fixturePath)
		}
	} else if err := os.WriteFile(fixturePath, encoded, 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	got := &agentv1.Envelope{}
	if err := proto.Unmarshal(encoded, got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !proto.Equal(want, got) {
		t.Fatalf("round trip mismatch:\nwant %v\ngot  %v", want, got)
	}

	hello, ok := got.GetPayload().(*agentv1.Envelope_AgentHello)
	if !ok {
		t.Fatalf("payload is %T, want AgentHello", got.GetPayload())
	}
	if hello.AgentHello.GetProtocolVersion() != ProtocolVersion {
		t.Fatalf("protocol version %d, want %d", hello.AgentHello.GetProtocolVersion(), ProtocolVersion)
	}
}
