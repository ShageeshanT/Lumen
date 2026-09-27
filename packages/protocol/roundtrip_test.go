package protocol

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"google.golang.org/protobuf/proto"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// The TypeScript test (src/roundtrip.test.ts) builds the same messages and
// must produce the same bytes, and verifies the signed fixture with the same
// key. Test key only: never used outside tests.
const testSeedHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"

const (
	testServerID = "srv_01j8x9k2d3m4n5p6q7r8s9t0v1"
	testOpID     = "0192f3a4-5b6c-7d8e-9fa0-b1c2d3e4f5a6"
	testTs       = int64(1790424000000) // 2026-09-26T12:00:00Z
)

func meta() *agentv1.Meta { return &agentv1.Meta{OpId: testOpID, TimestampMs: testTs} }

// samples returns one body-only Envelope per message type, keyed by fixture name.
func samples() map[string]*agentv1.Envelope {
	return map[string]*agentv1.Envelope{
		"agent_hello": {Body: &agentv1.Envelope_AgentHello{AgentHello: &agentv1.AgentHello{
			ServerId: testServerID, AgentVersion: "0.2.0", ProtocolVersion: ProtocolVersion,
			Os: "ubuntu", OsVersion: "24.04", Arch: "arm64", CpuCores: 4,
			MemoryBytes: 24 << 30, DiskBytes: 200 << 30, DockerVersion: "28.1.1",
			PublicIp: "203.0.113.10", Hostname: "oracle-1", Kernel: "6.8.0-1015-oracle",
			CaddyRunning: true, Capabilities: []string{"portcheck", "self-update"},
			Provider: "oracle", RegionLabel: "eu-frankfurt-1",
		}}},
		"control_hello": {Body: &agentv1.Envelope_ControlHello{ControlHello: &agentv1.ControlHello{
			Accepted: true, DesiredStateVersion: 7, NegotiatedProtocolVersion: 1, ServerTimeMs: testTs,
			Config: &agentv1.AgentConfig{
				HeartbeatIntervalS: 10, MetricsIntervalS: 10, LogRetentionDays: 7,
				CaddyImage: "caddy:2@sha256:abc", TcpProxyPortMin: 20000, TcpProxyPortMax: 29999,
				RotatedCredential: "",
			},
		}}},
		"control_hello_rejected": {Body: &agentv1.Envelope_ControlHello{ControlHello: &agentv1.ControlHello{
			Accepted: false, RejectReason: "CLOCK_SKEW", ServerTimeMs: testTs,
		}}},
		"heartbeat": {Body: &agentv1.Envelope_Heartbeat{Heartbeat: &agentv1.Heartbeat{
			Meta: meta(), DesiredStateVersionApplied: 7, ContainerCount: 3, DockerOk: true, CaddyOk: true,
		}}},
		"heartbeat_ack": {Body: &agentv1.Envelope_HeartbeatAck{HeartbeatAck: &agentv1.HeartbeatAck{
			OpId: testOpID, ServerTimeMs: testTs + 5,
		}}},
		"metrics_batch": {Body: &agentv1.Envelope_MetricsBatch{MetricsBatch: &agentv1.MetricsBatch{
			Meta: meta(),
			HostSample: &agentv1.HostSample{
				TsMs: testTs, CpuPercent: 12.5, Load1: 0.25, Load5: 0.5, Load15: 0.75,
				MemTotal: 1 << 30, MemUsed: 512 << 20, MemAvailable: 512 << 20, SwapTotal: 0, SwapUsed: 0,
				Disks: []*agentv1.DiskSample{
					{Mount: "/", Total: 50 << 30, Used: 10 << 30, Free: 40 << 30, InodesFree: 3000000},
					{Mount: "/var/lib/docker", Total: 50 << 30, Used: 10 << 30, Free: 40 << 30, InodesFree: 3000000},
				},
				Nets:           []*agentv1.NetSample{{Iface: "eth0", RxBytes: 1234, TxBytes: 5678}},
				UptimeS:        3600,
				ContainerCount: 1,
				Self:           &agentv1.AgentSelf{AgentRssBytes: 21 << 20, Goroutines: 17, SendQueueLen: 0, ReconnectsTotal: 2},
				DiskLow:        false,
			},
		}}},
		"port_check": {Body: &agentv1.Envelope_PortCheck{PortCheck: &agentv1.PortCheck{
			Meta: meta(), Ports: []uint32{80, 443}, Nonce: "n0nce",
		}}},
		"port_check_result": {Body: &agentv1.Envelope_PortCheckResult{PortCheckResult: &agentv1.PortCheckResult{
			OpId: testOpID,
			Ports: []*agentv1.PortState{
				{Port: 80, Listening: true, Listener: "caddy", NonceRouteInstalled: true},
				{Port: 443, Listening: false},
			},
		}}},
		"agent_update": {Body: &agentv1.Envelope_AgentUpdate{AgentUpdate: &agentv1.AgentUpdate{
			Meta: meta(), Version: "0.2.1", Url: "https://cp.example.com/agent/download/0.2.1/lumen-agent-linux-arm64",
			Sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Signature: "untrusted comment: x\n", Force: true,
		}}},
		"agent_update_result": {Body: &agentv1.Envelope_AgentUpdateResult{AgentUpdateResult: &agentv1.AgentUpdateResult{
			OpId: testOpID, Success: false, RunningVersion: "0.2.0", Error: "UPDATE_ROLLED_BACK",
		}}},
		"revoke": {Body: &agentv1.Envelope_Revoke{Revoke: &agentv1.Revoke{Meta: meta(), Reason: "Server removed"}}},
		"ack":    {Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: testOpID}}},
		"op_error": {Body: &agentv1.Envelope_OpError{OpError: &agentv1.OpError{
			OpId: testOpID, Code: "CLOCK_SKEW", Message: "clock is off",
			Details: map[string]string{"skew_ms": "420000", "limit_ms": "300000"},
		}}},
	}
}

func testKey(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	seed, err := hex.DecodeString(testSeedHex)
	if err != nil {
		t.Fatalf("decode seed: %v", err)
	}
	return ed25519.NewKeyFromSeed(seed)
}

// checkFixture writes the fixture on first run and fails when it changed.
func checkFixture(t *testing.T, name string, encoded []byte) {
	t.Helper()
	path := filepath.Join("testdata", name+".bin")
	if err := os.MkdirAll("testdata", 0o750); err != nil {
		t.Fatalf("mkdir testdata: %v", err)
	}
	if existing, err := os.ReadFile(path); err == nil { //nolint:gosec // fixed test fixture path
		if !bytes.Equal(existing, encoded) {
			t.Fatalf("%s is stale; delete it and rerun the test to regenerate", path)
		}
		return
	}
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
}

func TestEveryMessageRoundTrips(t *testing.T) {
	t.Parallel()
	for name, want := range samples() {
		encoded, err := proto.MarshalOptions{Deterministic: true}.Marshal(want)
		if err != nil {
			t.Fatalf("%s: marshal: %v", name, err)
		}
		checkFixture(t, name, encoded)
		got := &agentv1.Envelope{}
		if err := proto.Unmarshal(encoded, got); err != nil {
			t.Fatalf("%s: unmarshal: %v", name, err)
		}
		if !proto.Equal(want, got) {
			t.Fatalf("%s: round trip mismatch:\nwant %v\ngot  %v", name, want, got)
		}
	}
}

func TestSealOpenRoundTrip(t *testing.T) {
	t.Parallel()
	key := testKey(t)
	body := samples()["heartbeat"]
	env, err := Seal(key, testServerID, 42, testTs, body)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	wire, err := proto.MarshalOptions{Deterministic: true}.Marshal(env)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	checkFixture(t, "signed_heartbeat", wire)

	decoded, err := Unmarshal(wire)
	if err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	opened, err := Open(key.Public().(ed25519.PublicKey), decoded)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if !proto.Equal(opened, body) {
		t.Fatalf("opened body differs: %v", opened)
	}
}

func TestOpenRejectsTampering(t *testing.T) {
	t.Parallel()
	key := testKey(t)
	pub := key.Public().(ed25519.PublicKey)
	seal := func() *agentv1.Envelope {
		env, err := Seal(key, testServerID, 1, testTs, samples()["ack"])
		if err != nil {
			t.Fatalf("seal: %v", err)
		}
		return env
	}
	otherPub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}

	cases := map[string]struct {
		mutate func(*agentv1.Envelope)
		key    ed25519.PublicKey
		want   error
	}{
		"payload flipped": {func(e *agentv1.Envelope) { e.Payload[len(e.Payload)-1] ^= 1 }, pub, ErrBadSignature},
		"seq changed":     {func(e *agentv1.Envelope) { e.Seq = 2 }, pub, ErrBadSignature},
		"server changed":  {func(e *agentv1.Envelope) { e.ServerId = "srv_other" }, pub, ErrBadSignature},
		"time changed":    {func(e *agentv1.Envelope) { e.TimestampMs++ }, pub, ErrBadSignature},
		"version changed": {func(e *agentv1.Envelope) { e.ProtocolVersion = 2 }, pub, ErrBadSignature},
		"unsigned":        {func(e *agentv1.Envelope) { e.Signature = nil }, pub, ErrBadSignature},
		"wrong key":       {func(*agentv1.Envelope) {}, otherPub, ErrBadSignature},
		"outer body set": {func(e *agentv1.Envelope) {
			e.Body = &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: "x"}}
		}, pub, ErrMalformed},
		"empty payload": {func(e *agentv1.Envelope) { e.Payload = nil }, pub, ErrMalformed},
	}
	for name, tc := range cases {
		env := seal()
		tc.mutate(env)
		if _, err := Open(tc.key, env); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v, want %v", name, err, tc.want)
		}
	}
}

func TestSealRejectsBadBodies(t *testing.T) {
	t.Parallel()
	key := testKey(t)
	if _, err := Seal(key, testServerID, 1, testTs, &agentv1.Envelope{}); !errors.Is(err, ErrMalformed) {
		t.Fatalf("empty body: got %v", err)
	}
	withPayload := samples()["ack"]
	withPayload.Payload = []byte{1}
	if _, err := Seal(key, testServerID, 1, testTs, withPayload); !errors.Is(err, ErrMalformed) {
		t.Fatalf("payload in body: got %v", err)
	}
}

func TestAcceptsNAndNMinusOne(t *testing.T) {
	t.Parallel()
	if !Accepts(ProtocolVersion) {
		t.Fatal("must accept the current version")
	}
	if Accepts(ProtocolVersion + 1) {
		t.Fatal("must reject a newer version")
	}
	if Accepts(0) {
		t.Fatal("version 0 does not exist")
	}
}

func TestSigningBytesLayout(t *testing.T) {
	t.Parallel()
	got := SigningBytes(1, "ab", 2, 3, []byte{9})
	want := []byte{0, 0, 0, 1, 0, 2, 'a', 'b', 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 9}
	if !bytes.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
