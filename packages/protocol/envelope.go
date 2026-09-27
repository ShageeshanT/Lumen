package protocol

import (
	"crypto/ed25519"
	"encoding/binary"
	"errors"
	"fmt"
	"math"

	"google.golang.org/protobuf/proto"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// MaxMessageBytes is the largest frame either side accepts (PHASE-02 §5).
const MaxMessageBytes = 4 << 20

var (
	// ErrBadSignature means the envelope was not signed by the expected key.
	ErrBadSignature = errors.New("envelope signature is invalid")
	// ErrMalformed means the envelope or its payload could not be decoded or
	// breaks the framing rules (outer body set, empty payload, and so on).
	ErrMalformed = errors.New("envelope is malformed")
)

// SigningBytes returns the exact bytes an envelope signature covers:
// protocol_version (uint32) || len(server_id) (uint16) || server_id ||
// seq (uint64) || timestamp_ms (int64) || payload, integers big-endian.
func SigningBytes(version uint32, serverID string, seq uint64, timestampMs int64, payload []byte) []byte {
	idLen := len(serverID)
	if idLen > math.MaxUint16 {
		idLen = math.MaxUint16
	}
	out := make([]byte, 0, 4+2+idLen+8+8+len(payload))
	out = binary.BigEndian.AppendUint32(out, version)
	out = binary.BigEndian.AppendUint16(out, uint16(idLen)) //nolint:gosec // clamped to MaxUint16 above
	out = append(out, serverID[:idLen]...)
	out = binary.BigEndian.AppendUint64(out, seq)
	out = binary.BigEndian.AppendUint64(out, uint64(timestampMs)) //nolint:gosec // two's-complement encoding of a signed timestamp is intended
	out = append(out, payload...)
	return out
}

// Seal serializes body (an Envelope with only its `body` oneof set) into the
// payload of a new outer Envelope and signs it with key.
func Seal(key ed25519.PrivateKey, serverID string, seq uint64, timestampMs int64, body *agentv1.Envelope) (*agentv1.Envelope, error) {
	if body == nil || body.GetBody() == nil {
		return nil, fmt.Errorf("seal: %w: body is empty", ErrMalformed)
	}
	if body.GetPayload() != nil || body.GetSignature() != nil || body.GetSeq() != 0 {
		return nil, fmt.Errorf("seal: %w: body must carry only the oneof", ErrMalformed)
	}
	payload, err := proto.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("seal: marshal body: %w", err)
	}
	if len(payload) > MaxMessageBytes {
		return nil, fmt.Errorf("seal: %w: payload is %d bytes, limit %d", ErrMalformed, len(payload), MaxMessageBytes)
	}
	return &agentv1.Envelope{
		ProtocolVersion: ProtocolVersion,
		ServerId:        serverID,
		Seq:             seq,
		TimestampMs:     timestampMs,
		Payload:         payload,
		Signature:       ed25519.Sign(key, SigningBytes(ProtocolVersion, serverID, seq, timestampMs, payload)),
	}, nil
}

// Open verifies env's signature with key and decodes its payload. It returns
// the body-only Envelope. The outer envelope's own body must be unset.
func Open(key ed25519.PublicKey, env *agentv1.Envelope) (*agentv1.Envelope, error) {
	if env == nil || len(env.GetPayload()) == 0 {
		return nil, fmt.Errorf("open: %w: empty payload", ErrMalformed)
	}
	if env.GetBody() != nil {
		return nil, fmt.Errorf("open: %w: outer body must be unset", ErrMalformed)
	}
	if len(key) != ed25519.PublicKeySize || len(env.GetSignature()) != ed25519.SignatureSize {
		return nil, fmt.Errorf("open: %w", ErrBadSignature)
	}
	msg := SigningBytes(env.GetProtocolVersion(), env.GetServerId(), env.GetSeq(), env.GetTimestampMs(), env.GetPayload())
	if !ed25519.Verify(key, msg, env.GetSignature()) {
		return nil, fmt.Errorf("open: %w", ErrBadSignature)
	}
	body := &agentv1.Envelope{}
	if err := proto.Unmarshal(env.GetPayload(), body); err != nil {
		return nil, fmt.Errorf("open: %w: %w", ErrMalformed, err)
	}
	if body.GetBody() == nil || body.GetPayload() != nil || body.GetSignature() != nil {
		return nil, fmt.Errorf("open: %w: payload must carry exactly one body", ErrMalformed)
	}
	return body, nil
}

// Marshal encodes an outer envelope for the wire.
func Marshal(env *agentv1.Envelope) ([]byte, error) {
	b, err := proto.Marshal(env)
	if err != nil {
		return nil, fmt.Errorf("marshal envelope: %w", err)
	}
	return b, nil
}

// Unmarshal decodes a wire frame into an outer envelope.
func Unmarshal(frame []byte) (*agentv1.Envelope, error) {
	if len(frame) > MaxMessageBytes+1024 {
		return nil, fmt.Errorf("unmarshal: %w: frame too large", ErrMalformed)
	}
	env := &agentv1.Envelope{}
	if err := proto.Unmarshal(frame, env); err != nil {
		return nil, fmt.Errorf("unmarshal: %w: %w", ErrMalformed, err)
	}
	return env, nil
}

// Accepts reports whether a peer speaking version v can be served by this
// build: the current version N and N-1 (SPEC B5).
func Accepts(v uint32) bool {
	return v == ProtocolVersion || (ProtocolVersion > 1 && v == ProtocolVersion-1)
}
