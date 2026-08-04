import { describe, expect, it } from "vitest";
import { decideSlidingWindow } from "../plugins/rate-limit.js";

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
