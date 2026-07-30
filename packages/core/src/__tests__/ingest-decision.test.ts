import { describe, expect, it } from "vitest";
import { decideIngest, type ExistingActivityState, type IngestEventStatus } from "../index.js";

describe("decideIngest", () => {
  it.each<[ExistingActivityState | null, IngestEventStatus, string]>([
    [null, "pending", "insert"],
    [{ status: "pending", statusesSeen: ["pending"] }, "pending", "duplicate"],
    [{ status: "pending", statusesSeen: ["pending"] }, "confirmed", "promote"],
    [{ status: "confirmed", statusesSeen: ["pending", "confirmed"] }, "pending", "duplicate"],
    [{ status: "confirmed", statusesSeen: ["pending", "confirmed"] }, "definitively_failed", "accept_noop"],
    [{ status: "confirmed", statusesSeen: ["confirmed"] }, "pending", "accept_noop"],
  ])("existing=%j incoming=%s -> %s", (existing, incoming, outcome) => {
    expect(decideIngest(existing, incoming).outcome).toBe(outcome);
  });
});
