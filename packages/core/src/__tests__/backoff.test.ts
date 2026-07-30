import { describe, expect, it } from "vitest";
import { nextBackoff } from "../backoff.js";

const firstAttemptAt = new Date("2026-07-30T00:00:00Z");
const wellWithinAge = new Date("2026-07-30T01:00:00Z");
const schedule = ["1m", "5m"];

describe("nextBackoff", () => {
  it("returns the scheduled interval for each attempt", () => {
    expect(nextBackoff({ attempts: 0, schedule, firstAttemptAt, maxAgeDays: 30, now: wellWithinAge })).toEqual({
      delayMs: 60_000,
    });
    expect(nextBackoff({ attempts: 1, schedule, firstAttemptAt, maxAgeDays: 30, now: wellWithinAge })).toEqual({
      delayMs: 300_000,
    });
  });

  it("repeats the last interval once the schedule is exhausted", () => {
    expect(nextBackoff({ attempts: 2, schedule, firstAttemptAt, maxAgeDays: 30, now: wellWithinAge })).toEqual({
      delayMs: 300_000,
    });
  });

  it("gives up when now is past maxAgeDays regardless of attempts", () => {
    const pastAgeCap = new Date("2026-08-29T00:00:01Z");
    expect(nextBackoff({ attempts: 0, schedule, firstAttemptAt, maxAgeDays: 30, now: pastAgeCap })).toEqual({
      giveUp: true,
    });
    expect(nextBackoff({ attempts: 7, schedule, firstAttemptAt, maxAgeDays: 30, now: pastAgeCap })).toEqual({
      giveUp: true,
    });
  });

  it("still delays exactly at the age cap", () => {
    const exactlyAtAgeCap = new Date("2026-08-29T00:00:00Z");
    expect(nextBackoff({ attempts: 0, schedule, firstAttemptAt, maxAgeDays: 30, now: exactlyAtAgeCap })).toEqual({
      delayMs: 60_000,
    });
  });
});
