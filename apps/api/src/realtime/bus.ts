import pg from "pg";

import type { Logger } from "../logger";

export type BusHandler = (payload: string) => void;

/**
 * Postgres LISTEN/NOTIFY (SPEC tech stack: no Redis). `publish` uses the
 * pool; `subscribe` holds one dedicated connection and reconnects with a
 * short backoff. Payloads must stay under Postgres's 8000-byte limit.
 */
export interface Bus {
  publish(channel: string, payload: string): Promise<void>;
  subscribe(channel: string, handler: BusHandler): Promise<void>;
  close(): Promise<void>;
}

const CHANNEL = /^[a-z_][a-z0-9_]*$/;

export class PgBus implements Bus {
  private client: pg.Client | undefined;
  private readonly handlers = new Map<string, Set<BusHandler>>();
  private closed = false;
  private connecting: Promise<void> | undefined;

  constructor(
    private readonly pool: pg.Pool,
    private readonly connectionString: string,
    private readonly logger: Logger,
  ) {}

  async publish(channel: string, payload: string): Promise<void> {
    if (!CHANNEL.test(channel)) {
      throw new Error(`invalid channel ${channel}`);
    }
    await this.pool.query("select pg_notify($1, $2)", [channel, payload]);
  }

  async subscribe(channel: string, handler: BusHandler): Promise<void> {
    if (!CHANNEL.test(channel)) {
      throw new Error(`invalid channel ${channel}`);
    }
    let set = this.handlers.get(channel);
    const isNew = set === undefined;
    if (set === undefined) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    await this.connect();
    if (isNew && this.client !== undefined) {
      await this.client.query(`listen ${channel}`);
    }
  }

  private async connect(): Promise<void> {
    if (this.client !== undefined || this.closed) {
      return;
    }
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
  }

  private async open(): Promise<void> {
    const client = new pg.Client({ connectionString: this.connectionString });
    client.on("notification", (msg) => {
      const handlers = this.handlers.get(msg.channel);
      if (handlers === undefined || msg.payload === undefined) {
        return;
      }
      for (const h of handlers) {
        try {
          h(msg.payload);
        } catch (error) {
          this.logger.error({ err: error, channel: msg.channel }, "bus handler failed");
        }
      }
    });
    client.on("error", (error) => {
      this.logger.warn({ err: error }, "realtime connection to Postgres lost; reconnecting");
      this.client = undefined;
      void client.end().catch(() => undefined);
      this.reconnectSoon();
    });
    await client.connect();
    for (const channel of this.handlers.keys()) {
      await client.query(`listen ${channel}`);
    }
    this.client = client;
  }

  private reconnectSoon(): void {
    if (this.closed) {
      return;
    }
    setTimeout(() => {
      this.connect().catch((error: unknown) => {
        this.logger.warn({ err: error }, "realtime reconnect failed");
        this.reconnectSoon();
      });
    }, 1_000).unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    const c = this.client;
    this.client = undefined;
    if (c !== undefined) {
      await c.end();
    }
  }
}
