import { describe, expect, it } from "vitest";
import { eventSchema, type IngestEvent } from "@agentscan/contract";
import {
  checkSimApiUrl,
  deriveSimAgents,
  generateBackfill,
  initialLiveState,
  mulberry32,
  nextLiveScenario,
  type SimScenario,
} from "../generator.js";

const fixedNow = new Date("2026-07-30T12:00:00.000Z");
const largeBackfill = { days: 30, perDay: 20, now: fixedNow };

function collectScenarios(seed: number, count: number): SimScenario[] {
  const rng = mulberry32(seed);
  let state = initialLiveState(rng, fixedNow);
  const scenarios: SimScenario[] = [];
  for (let index = 0; index < count; index += 1) {
    const scenario = nextLiveScenario(rng, state);
    scenarios.push(scenario);
    state = scenario.state;
  }
  return scenarios;
}

function groupBySourceRowId(events: IngestEvent[]): Map<string, IngestEvent[]> {
  const groups = new Map<string, IngestEvent[]>();
  for (const event of events) {
    const group = groups.get(event.sourceRowId) ?? [];
    group.push(event);
    groups.set(event.sourceRowId, group);
  }
  return groups;
}

describe("generateBackfill", () => {
  it("emits at least 500 events that all pass the contract event schema in batches of at most 500", () => {
    const batches = generateBackfill(mulberry32(42), largeBackfill);
    const events = batches.flat();

    expect(events.length).toBeGreaterThanOrEqual(500);
    expect(batches.every((batch) => batch.length <= 500)).toBe(true);
    for (const event of events) {
      expect(() => eventSchema.parse(event)).not.toThrow();
    }
  });

  it("spreads confirmedAt across the past days and never into the future", () => {
    const events = generateBackfill(mulberry32(42), largeBackfill).flat();
    const confirmedDays = new Set(
      events
        .map((event) => event.confirmedAt)
        .filter((confirmedAt): confirmedAt is string => confirmedAt !== null)
        .map((confirmedAt) => confirmedAt.slice(0, 10)),
    );

    expect(confirmedDays.size).toBeGreaterThanOrEqual(25);
    for (const event of events) {
      if (event.confirmedAt === null) continue;
      expect(new Date(event.confirmedAt).getTime()).toBeLessThan(fixedNow.getTime());
    }
  });

  it("produces identical batches for the same seed and different batches for a different seed", () => {
    const opts = { days: 5, perDay: 8, now: fixedNow };

    expect(generateBackfill(mulberry32(11), opts)).toEqual(generateBackfill(mulberry32(11), opts));
    expect(generateBackfill(mulberry32(11), opts)).not.toEqual(generateBackfill(mulberry32(12), opts));
  });

  it("emits every bridge execution as two legs sharing sourceExecutionId with provider-native solana chain ids", () => {
    const events = generateBackfill(mulberry32(99), largeBackfill).flat();
    const bridgeLegs = events.filter((event) => event.kind === "bridge");
    const executions = new Map<string, IngestEvent[]>();
    for (const leg of bridgeLegs) {
      const legs = executions.get(leg.sourceExecutionId) ?? [];
      legs.push(leg);
      executions.set(leg.sourceExecutionId, legs);
    }

    expect(executions.size).toBeGreaterThan(0);
    expect(new Set(bridgeLegs.map((leg) => leg.protocol))).toEqual(new Set(["khalani", "relay"]));
    for (const legs of executions.values()) {
      const deposit = legs.find((leg) => leg.eventIndex === 0);
      const fill = legs.find((leg) => leg.eventIndex === 1);
      expect(legs).toHaveLength(2);
      expect(deposit?.eventRole).toBe("bridge_deposit");
      expect(fill?.eventRole).toBe("bridge_fill_expected");
      expect(deposit?.fromChainId).not.toBeNull();
      expect(deposit?.toChainId).not.toBeNull();
      expect(fill?.fromChainId).toBe(deposit?.fromChainId);
      expect(fill?.toChainId).toBe(deposit?.toChainId);
      const expectedSolanaChainId = deposit?.protocol === "khalani" ? 20011000000n : 792703809n;
      const solanaLeg = legs.find((leg) => leg.chainFamily === "solana");
      expect(solanaLeg?.chainId).toBe(expectedSolanaChainId);
      expect([deposit?.fromChainId, deposit?.toChainId]).toContain(expectedSolanaChainId);
    }
  });
});

describe("nextLiveScenario", () => {
  it("emits step events that all pass the contract event schema", () => {
    for (const scenario of collectScenarios(7, 200)) {
      for (const step of scenario.steps) {
        expect(() => eventSchema.parse(step.event)).not.toThrow();
      }
    }
  });

  it("only ever moves a sourceRowId from pending to a terminal status", () => {
    for (const scenario of collectScenarios(21, 300)) {
      for (const steps of groupBySourceRowId(scenario.steps.map((step) => step.event)).values()) {
        for (let index = 1; index < steps.length; index += 1) {
          expect(steps[index - 1]?.status).toBe("pending");
          expect(steps[index]?.status).not.toBe("pending");
        }
      }
    }
  });

  it("produces identical scenarios for the same seed and different scenarios for a different seed", () => {
    expect(collectScenarios(5, 40)).toEqual(collectScenarios(5, 40));
    expect(collectScenarios(5, 40)).not.toEqual(collectScenarios(6, 40));
  });
});

describe("deriveSimAgents", () => {
  it("derives stable well-formed distinct identities from the seed", () => {
    const agents = deriveSimAgents(1337, 4);

    expect(agents).toEqual(deriveSimAgents(1337, 4));
    expect(agents).not.toEqual(deriveSimAgents(1338, 4));
    expect(new Set(agents.map((agent) => agent.agentHash)).size).toBe(4);
    for (const agent of agents) {
      expect(agent.agentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(agent.ingestToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});

describe("checkSimApiUrl", () => {
  it("accepts local hosts, rejects remote hosts without allowRemote and accepts them with it", () => {
    expect(checkSimApiUrl("http://localhost", false)).toEqual({ ok: true });
    expect(checkSimApiUrl("http://localhost:8080/api", false)).toEqual({ ok: true });
    expect(checkSimApiUrl("http://127.0.0.1:3000", false)).toEqual({ ok: true });
    expect(checkSimApiUrl("https://agentscan.example.com", false)).toEqual({
      ok: false,
      reason:
        'SIM_API_URL host "agentscan.example.com" is not localhost/127.0.0.1; pass --allow-remote to target a non-local API deliberately',
    });
    expect(checkSimApiUrl("https://agentscan.example.com", true)).toEqual({ ok: true });
    expect(checkSimApiUrl("not-a-url", false)).toEqual({
      ok: false,
      reason: 'SIM_API_URL "not-a-url" is not a valid URL',
    });
  });
});
