/**
 * In-process token bucket. One API process is the supported topology until
 * Phase 04 (SPEC_QUESTIONS 20); a Postgres-backed limiter is the upgrade path.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  /** Takes `cost` tokens; false when not enough are left. */
  take(cost = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((t - this.last) / 1000) * this.refillPerSecond,
    );
    this.last = t;
    if (this.tokens < cost) {
      return false;
    }
    this.tokens -= cost;
    return true;
  }
}

/** Fixed-window counter per key (join attempts per IP). */
export class WindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns seconds to wait when over the limit, else 0. */
  hit(key: string): number {
    const t = this.now();
    let entry = this.hits.get(key);
    if (entry === undefined || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.resetAt <= t) {
          this.hits.delete(k);
        }
      }
    }
    return entry.count > this.limit ? Math.ceil((entry.resetAt - t) / 1000) : 0;
  }
}
