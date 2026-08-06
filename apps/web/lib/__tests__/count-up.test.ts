import { describe, expect, it } from "vitest";
import { COUNT_UP_MS, COUNT_UP_THRESHOLD, countUpText, easeOutCubic } from "../count-up";

describe("countUpText", () => {
  it("formats an intermediate usd frame with the estimate formatter", () => {
    expect(countUpText("usd", 1284.5)).toBe("$1,284.5");
  });

  it("keeps both cents of an intermediate usd frame", () => {
    expect(countUpText("usd", 1284.567)).toBe("$1,284.57");
  });

  it("rounds an intermediate count frame to grouped whole digits", () => {
    expect(countUpText("count", 4187.6)).toBe("4,188");
  });
});

describe("easeOutCubic", () => {
  it("starts at zero", () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it("ends at one", () => {
    expect(easeOutCubic(1)).toBe(1);
  });
});

describe("count up timing", () => {
  it("runs for 1500 ms as the motion catalogue requires", () => {
    expect(COUNT_UP_MS).toBe(1500);
  });

  it("starts when the card is 40 percent visible", () => {
    expect(COUNT_UP_THRESHOLD).toBe(0.4);
  });
});
