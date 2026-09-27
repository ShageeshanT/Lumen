/**
 * Gateway metrics in Prometheus text format, served on `/internal/metrics`
 * to loopback clients only (PHASE-02 §5 Observability).
 */
export class GatewayMetrics {
  connectedAgents = 0;
  readonly messagesByType = new Map<string, number>();
  signatureFailures = 0;
  sequenceFailures = 0;
  clockSkewRejections = 0;
  rateLimitCloses = 0;
  superseded = 0;
  /** Heartbeat lag: server receive time minus envelope timestamp, in seconds. */
  private readonly lagBuckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  private readonly lagCounts = new Array<number>(this.lagBuckets.length).fill(0);
  private lagSum = 0;
  private lagCount = 0;

  message(type: string): void {
    this.messagesByType.set(type, (this.messagesByType.get(type) ?? 0) + 1);
  }

  heartbeatLag(seconds: number): void {
    const s = Math.max(0, seconds);
    this.lagBuckets.forEach((b, i) => {
      if (s <= b) {
        this.lagCounts[i] = (this.lagCounts[i] ?? 0) + 1;
      }
    });
    this.lagSum += s;
    this.lagCount += 1;
  }

  render(): string {
    const lines: string[] = [
      "# HELP lumen_gateway_connected_agents Agents connected to this API process.",
      "# TYPE lumen_gateway_connected_agents gauge",
      `lumen_gateway_connected_agents ${String(this.connectedAgents)}`,
      "# HELP lumen_gateway_messages_total Agent messages received, by type.",
      "# TYPE lumen_gateway_messages_total counter",
    ];
    for (const [type, n] of [...this.messagesByType.entries()].sort()) {
      lines.push(`lumen_gateway_messages_total{type="${type}"} ${String(n)}`);
    }
    const counters: [string, string, number][] = [
      [
        "signature_failures_total",
        "Envelopes rejected for a bad or missing signature.",
        this.signatureFailures,
      ],
      [
        "sequence_failures_total",
        "Connections closed for a repeated or skipped seq.",
        this.sequenceFailures,
      ],
      [
        "clock_skew_rejections_total",
        "Envelopes rejected for an out-of-window timestamp.",
        this.clockSkewRejections,
      ],
      [
        "rate_limit_closes_total",
        "Connections closed with 4008 rate_limited.",
        this.rateLimitCloses,
      ],
      ["superseded_total", "Connections closed with 4001 superseded.", this.superseded],
    ];
    for (const [name, help, value] of counters) {
      lines.push(`# HELP lumen_gateway_${name} ${help}`, `# TYPE lumen_gateway_${name} counter`);
      lines.push(`lumen_gateway_${name} ${String(value)}`);
    }
    lines.push(
      "# HELP lumen_gateway_heartbeat_lag_seconds Receive time minus heartbeat timestamp.",
      "# TYPE lumen_gateway_heartbeat_lag_seconds histogram",
    );
    this.lagBuckets.forEach((b, i) => {
      lines.push(
        `lumen_gateway_heartbeat_lag_seconds_bucket{le="${String(b)}"} ${String(this.lagCounts[i] ?? 0)}`,
      );
    });
    lines.push(
      `lumen_gateway_heartbeat_lag_seconds_bucket{le="+Inf"} ${String(this.lagCount)}`,
      `lumen_gateway_heartbeat_lag_seconds_sum ${String(this.lagSum)}`,
      `lumen_gateway_heartbeat_lag_seconds_count ${String(this.lagCount)}`,
    );
    return `${lines.join("\n")}\n`;
  }
}
