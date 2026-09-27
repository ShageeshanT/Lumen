# @lumen/protocol

The agent ↔ control plane wire protocol: protobuf messages over one outbound
WebSocket per server (SPEC B5, PHASE-02 §4.1).

## Layout

| Path                             | What                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `proto/lumen/agent/v1/*.proto`   | Source of truth, one file per concern                                                 |
| `gen/go`, `gen/ts`               | Generated code, committed (DECISIONS 0013)                                            |
| `envelope.go`, `src/envelope.ts` | Sealing (signing) and opening (verifying) envelopes; the two must produce equal bytes |
| `PROTOCOL_VERSION`               | The version this build speaks; Go and TS constants are tested against it              |
| `testdata/*.bin`                 | Fixtures written by the Go test and read by the TypeScript test                       |

Regenerate with `pnpm --filter @lumen/protocol generate` (or `pnpm gen`); lint with
`pnpm lint:proto`. Fixtures are rewritten by deleting `testdata/*.bin` and running
`go test ./packages/protocol/...`.

## Framing

Every WebSocket binary frame is one `Envelope`. The sender puts the message in
the `body` oneof of an otherwise empty `Envelope`, serializes it, and places those
bytes in the outer envelope's `payload`. The outer envelope carries
`protocol_version`, `server_id`, `seq` (strictly increasing per connection and per
direction, from 1), `timestamp_ms` and an Ed25519 `signature` over:

```
protocol_version u32 || len(server_id) u16 || server_id || seq u64 || timestamp_ms i64 || payload
```

(big-endian). The agent signs with its identity key (registered at join); the
control plane signs with its instance key (public half returned by the join
endpoint). Receivers reject unsigned or wrongly signed frames, a repeated or
skipped `seq` (close code `4002`), and timestamps more than 5 minutes old or 1
minute in the future (`OpError{code: CLOCK_SKEW}`).

## Messages (field numbers of `Envelope.body`)

| #   | Message             | Direction | Answered by                      |
| --- | ------------------- | --------- | -------------------------------- |
| 10  | `AgentHello`        | agent →   | `ControlHello`                   |
| 11  | `ControlHello`      | → agent   | —                                |
| 12  | `Heartbeat`         | agent →   | `HeartbeatAck`                   |
| 13  | `HeartbeatAck`      | → agent   | —                                |
| 14  | `MetricsBatch`      | agent →   | nothing (fire and forget)        |
| 15  | `PortCheck`         | → agent   | `PortCheckResult` or `OpError`   |
| 16  | `PortCheckResult`   | agent →   | —                                |
| 17  | `AgentUpdate`       | → agent   | `Ack`, later `AgentUpdateResult` |
| 18  | `AgentUpdateResult` | agent →   | —                                |
| 19  | `Revoke`            | → agent   | `Ack`                            |
| 20  | `Ack`               | both      | —                                |
| 21  | `OpError`           | both      | —                                |

30–99 are reserved for Phase 03 (`DesiredState`, `ActualState`, `Build*`, `Log*`,
`Exec*`); 100+ for Phases 09 and 12. Numbers are only appended, never reused;
removed fields become `reserved`.

## Versioning

The control plane accepts agents at protocol `N` and `N-1`. `buf breaking` runs in
CI against `main`. Protocol v1's baseline is the Phase 02 envelope; the Phase 00
placeholder never shipped.
