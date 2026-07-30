export type RateLimitDecision = { ok: true } | { ok: false; retryAfterSec: number };

export class SlidingWindowLimiter {
  private readonly limit: number;
  private readonly windowSec: number;
  private readonly hitsByKey = new Map<string, number[]>();

  constructor(limit: number, windowSec: number) {
    this.limit = limit;
    this.windowSec = windowSec;
  }

  allow(key: string): RateLimitDecision {
    const now = Date.now();
    const windowStartMs = now - this.windowSec * 1000;
    const recentHits = (this.hitsByKey.get(key) ?? []).filter((hitMs) => hitMs > windowStartMs);
    if (recentHits.length >= this.limit) {
      this.hitsByKey.set(key, recentHits);
      const oldestHitMs = recentHits[0] ?? now;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((oldestHitMs + this.windowSec * 1000 - now) / 1000),
      );
      return { ok: false, retryAfterSec };
    }
    recentHits.push(now);
    this.hitsByKey.set(key, recentHits);
    return { ok: true };
  }
}
