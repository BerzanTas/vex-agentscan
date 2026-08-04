import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideSlidingWindow, SlidingWindowLimiter } from "../plugins/rate-limit.js";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects the third call within the window at limit 2 per 60s", async () => {
    const limiter = new SlidingWindowLimiter(2, 60);
    expect(await limiter.allow("key")).toEqual({ ok: true });
    expect(await limiter.allow("key")).toEqual({ ok: true });
    const third = (await limiter.allow("key")) as { ok: false; retryAfterSec: number };
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(third.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("allows again after the window has passed", async () => {
    const limiter = new SlidingWindowLimiter(2, 60);
    expect(await limiter.allow("key")).toEqual({ ok: true });
    expect(await limiter.allow("key")).toEqual({ ok: true });
    vi.advanceTimersByTime(60_001);
    expect(await limiter.allow("key")).toEqual({ ok: true });
  });
});

describe("decideSlidingWindow", () => {
  it("odrzuca trzecie trafienie przy limicie 2 i nie dopisuje go do okna", () => {
    const outcome = decideSlidingWindow({
      hitsMs: [1_000, 2_000],
      nowMs: 3_000,
      limit: 2,
      windowSec: 60,
    });
    expect(outcome.decision).toEqual({ ok: false, retryAfterSec: 58 });
    expect(outcome.hitsMs).toEqual([1_000, 2_000]);
  });

  it("dopisuje trafienie i przycina te sprzed okna", () => {
    const outcome = decideSlidingWindow({
      hitsMs: [1_000, 2_000],
      nowMs: 61_500,
      limit: 2,
      windowSec: 60,
    });
    expect(outcome.decision).toEqual({ ok: true });
    expect(outcome.hitsMs).toEqual([2_000, 61_500]);
  });
});
