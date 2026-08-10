import { describe, expect, it } from "vitest";
import { agentNameCandidates } from "../agent-name.js";

describe("agentNameCandidates", () => {
  it("yields Vex- prefixed candidates at 8, 12, then 16 hex characters", () => {
    const agentHash = "0123456789abcdef" + "f".repeat(48);
    expect(agentNameCandidates(agentHash)).toEqual([
      "Vex-01234567",
      "Vex-0123456789ab",
      "Vex-0123456789abcdef",
    ]);
  });

  it("derives every candidate from the front of the agent hash", () => {
    const agentHash = "a".repeat(64);
    for (const candidate of agentNameCandidates(agentHash)) {
      expect(candidate.startsWith("Vex-")).toBe(true);
      expect(agentHash.startsWith(candidate.slice("Vex-".length))).toBe(true);
    }
  });
});
