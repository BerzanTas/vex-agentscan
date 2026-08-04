export type RateLimitDecision = { ok: true } | { ok: false; retryAfterSec: number };

export type SlidingWindowInput = {
  hitsMs: number[];
  nowMs: number;
  limit: number;
  windowSec: number;
};

export type SlidingWindowOutcome = { decision: RateLimitDecision; hitsMs: number[] };

export interface RateLimiter {
  allow(key: string): Promise<RateLimitDecision>;
}

export function decideSlidingWindow(input: SlidingWindowInput): SlidingWindowOutcome {
  const windowStartMs = input.nowMs - input.windowSec * 1000;
  const recentHits = input.hitsMs.filter((hitMs) => hitMs > windowStartMs);
  if (recentHits.length >= input.limit) {
    const oldestHitMs = recentHits[0] ?? input.nowMs;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestHitMs + input.windowSec * 1000 - input.nowMs) / 1000),
    );
    return { decision: { ok: false, retryAfterSec }, hitsMs: recentHits };
  }
  return { decision: { ok: true }, hitsMs: [...recentHits, input.nowMs] };
}
