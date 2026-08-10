import { describe, expect, it } from "vitest";
import {
  decideIngest,
  isFailedIngestStatus,
  isTerminalIngestStatus,
  type ExistingActivityState,
  type IngestEventStatus,
} from "../index.js";

describe("decideIngest", () => {
  it.each<[ExistingActivityState | null, IngestEventStatus, string]>([
    [null, "pending", "insert"],
    [{ status: "pending", statusesSeen: ["pending"] }, "pending", "duplicate"],
    [{ status: "pending", statusesSeen: ["pending"] }, "confirmed", "promote"],
    [{ status: "confirmed", statusesSeen: ["pending", "confirmed"] }, "pending", "duplicate"],
    [{ status: "confirmed", statusesSeen: ["pending", "confirmed"] }, "definitively_failed", "accept_noop"],
    [{ status: "confirmed", statusesSeen: ["confirmed"] }, "pending", "accept_noop"],
    [{ status: "pending", statusesSeen: ["pending"] }, "superseded_unproven", "promote"],
    [{ status: "superseded_unproven", statusesSeen: ["pending", "superseded_unproven"] }, "confirmed", "accept_noop"],
    [{ status: "confirmed", statusesSeen: ["pending", "confirmed"] }, "superseded_unproven", "accept_noop"],
    [{ status: "superseded_unproven", statusesSeen: ["superseded_unproven"] }, "superseded_unproven", "duplicate"],
  ])("existing=%j incoming=%s -> %s", (existing, incoming, outcome) => {
    expect(decideIngest(existing, incoming).outcome).toBe(outcome);
  });
});

describe("isTerminalIngestStatus", () => {
  it.each<[IngestEventStatus, boolean]>([
    ["pending", false],
    ["confirmed", true],
    ["definitively_failed", true],
    ["superseded_unproven", true],
  ])("%s -> %s", (status, terminal) => {
    expect(isTerminalIngestStatus(status)).toBe(terminal);
  });
});

describe("isFailedIngestStatus", () => {
  it("treats superseded_unproven as a non-failure", () => {
    expect(isFailedIngestStatus("superseded_unproven")).toBe(false);
  });
  it("treats definitively_failed as the only failed status", () => {
    expect(isFailedIngestStatus("definitively_failed")).toBe(true);
  });
});
