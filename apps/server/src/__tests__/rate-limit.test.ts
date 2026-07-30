import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlidingWindowLimiter } from "../plugins/rate-limit.js";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects the third call within the window at limit 2 per 60s", () => {
    const limiter = new SlidingWindowLimiter(2, 60);
    expect(limiter.allow("key")).toEqual({ ok: true });
    expect(limiter.allow("key")).toEqual({ ok: true });
    const third = limiter.allow("key") as { ok: false; retryAfterSec: number };
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(third.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("allows again after the window has passed", () => {
    const limiter = new SlidingWindowLimiter(2, 60);
    expect(limiter.allow("key")).toEqual({ ok: true });
    expect(limiter.allow("key")).toEqual({ ok: true });
    vi.advanceTimersByTime(60_001);
    expect(limiter.allow("key")).toEqual({ ok: true });
  });
});
