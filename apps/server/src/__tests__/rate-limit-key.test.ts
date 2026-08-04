import { describe, expect, it } from "vitest";
import { rateLimitKeyHash } from "../plugins/rate-limit-key.js";

describe("rateLimitKeyHash", () => {
  it("zwraca 64 znaki heksadecymalne", () => {
    expect(rateLimitKeyHash("register", "203.0.113.7", "salt")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("nie zawiera wartości wejściowej", () => {
    const hash = rateLimitKeyHash("register", "203.0.113.7", "salt");
    expect(hash).not.toContain("203.0.113.7");
  });

  it("rozdziela zakresy dla tej samej wartości", () => {
    const ingest = rateLimitKeyHash("ingest", "same-value", "salt");
    const register = rateLimitKeyHash("register", "same-value", "salt");
    expect(ingest).not.toEqual(register);
  });

  it("rozdziela sole dla tej samej wartości", () => {
    const first = rateLimitKeyHash("register", "203.0.113.7", "salt-a");
    const second = rateLimitKeyHash("register", "203.0.113.7", "salt-b");
    expect(first).not.toEqual(second);
  });
});
