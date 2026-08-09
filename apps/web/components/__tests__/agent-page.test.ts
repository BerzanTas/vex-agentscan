import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPageDisclosure } from "../AgentPageDisclosure";
import { AgentPagePerformance } from "../AgentPagePerformance";
import { AgentPageView } from "../AgentPageView";
import { deployedChartPoints } from "../AgentPageDeployedChart";
import type { AgentPageDto } from "../../lib/api";

const SERIES_FIRST_DAY = Date.UTC(2026, 6, 11);
const DAY_MS = 86_400_000;
const TX_HASH = `0x${"ab".repeat(32)}`;
const EVM_ADDRESS = `0x${"cd".repeat(20)}`;
const EXPLORER_URL = `https://basescan.org/tx/${TX_HASH}`;

function thirtyDaysDeployed(): AgentPageDto["dailyDeployedUsd"] {
  return Array.from({ length: 30 }, (_unused, index) => ({
    day: new Date(SERIES_FIRST_DAY + index * DAY_MS).toISOString().slice(0, 10),
    usd: index === 29 ? "184320.75" : "1000.00",
  }));
}

const agent: AgentPageDto = {
  name: "Vex-9f2a41c8",
  capitalDeployedPeak30dUsd: "184320.75",
  dailyDeployedUsd: thirtyDaysDeployed(),
  realizedResultUsd: "12480.50",
  closedRoundTrips: 18,
  unmatchedDisposals: 2,
  winRate: 0.61,
  protocolBreakdown: [
    { protocol: "kyberswap", volumeUsd: "120400.00", txCount: 240 },
    { protocol: "relay", volumeUsd: "63920.75", txCount: 172 },
  ],
  chainBreakdown: [
    { chainSlug: "base", volumeUsd: "140000.00", txCount: 300 },
    { chainSlug: null, volumeUsd: "44320.75", txCount: 112 },
  ],
  activityCount: 412,
  activitiesPerDay30d: 13.7,
  firstSeenSeconds: 5_184_000,
  lastSeenSeconds: 7200,
  unpricedSharePct: 12.5,
  truncated: false,
};

function viewMarkup(page: AgentPageDto): string {
  return renderToStaticMarkup(createElement(AgentPageView, { agent: page }));
}

function performanceMarkup(page: AgentPageDto): string {
  return renderToStaticMarkup(createElement(AgentPagePerformance, { agent: page }));
}

function disclosureMarkup(unpricedSharePct: number, truncated: boolean): string {
  return renderToStaticMarkup(
    createElement(AgentPageDisclosure, { unpricedSharePct, truncated }),
  );
}

function rowLabels(markup: string): string[] {
  return [...markup.matchAll(/<td class="text-text-primary">(.*?)<\/td>/g)].map((match) =>
    (match[1] ?? "").replace(/<[^>]*>/g, ""),
  );
}

describe("AgentPageView", () => {
  it("names the agent and dates its activity in the header", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain("Vex-9f2a41c8");
    expect(markup).toContain("First seen 60d ago");
    expect(markup).toContain("Last seen 2h ago");
    expect(markup).toContain("412 verified activities");
  });

  it("headlines the peak deployed capital as flow through the agent, never as holdings", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain("$184.3K");
    expect(markup).toContain('title="$184,320.75"');
    expect(markup).toContain("deployed through agent activity");
    expect(markup).not.toMatch(/portfolio/i);
    expect(markup).not.toMatch(/assets under management/i);
  });

  it("reports the realized result, the closed round trips and the win rate", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain('title="$12,480.50"');
    expect(markup).toContain("$12.5K");
    expect(markup).toContain(">18<");
    expect(markup).toContain("61%");
  });

  it("reports the trailing thirty day cadence", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain("13.7");
    expect(markup).toContain("/ day");
  });

  it("counts the disposals that found no matching acquisition", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain("2 disposals found no matching acquisition");
  });

  it("lists every protocol and chain of the breakdown", () => {
    const markup = viewMarkup(agent);

    expect(rowLabels(markup)).toEqual(["kyberswap", "relay", "base", "unknown chain"]);
    expect(markup).toContain('title="$120,400.00"');
    expect(markup).toContain('title="$63,920.75"');
    expect(markup).toContain('title="$140,000.00"');
    expect(markup).toContain('title="$44,320.75"');
  });

  it("keeps a chain row without a slug as an unknown chain instead of dropping it", () => {
    const markup = viewMarkup({
      ...agent,
      chainBreakdown: [{ chainSlug: null, volumeUsd: "44320.75", txCount: 112 }],
    });

    expect(rowLabels(markup)).toEqual(["kyberswap", "relay", "unknown chain"]);
    expect(markup).toContain('title="$44,320.75"');
  });

  it("always states the unpriced share of the agent activity", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain("12.5% of this agent");
    expect(markup).toContain("could not be priced and is excluded from USD figures");
  });

  it("renders no transaction hash even when one arrives in a label field", () => {
    const markup = viewMarkup({
      ...agent,
      protocolBreakdown: [{ protocol: TX_HASH, volumeUsd: "120400.00", txCount: 240 }],
      chainBreakdown: [{ chainSlug: TX_HASH, volumeUsd: "140000.00", txCount: 300 }],
    });

    expect(markup).not.toMatch(/0x[0-9a-fA-F]{64}/);
    expect(rowLabels(markup)).toEqual(["unknown protocol", "unknown chain"]);
  });

  it("renders no wallet address even when one arrives in a label field", () => {
    const markup = viewMarkup({
      ...agent,
      protocolBreakdown: [{ protocol: EVM_ADDRESS, volumeUsd: "120400.00", txCount: 240 }],
      chainBreakdown: [{ chainSlug: EVM_ADDRESS, volumeUsd: "140000.00", txCount: 300 }],
    });

    expect(markup).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(rowLabels(markup)).toEqual(["unknown protocol", "unknown chain"]);
  });

  it("renders no explorer link even when one arrives in a label field", () => {
    const markup = viewMarkup({
      ...agent,
      protocolBreakdown: [{ protocol: EXPLORER_URL, volumeUsd: "120400.00", txCount: 240 }],
      chainBreakdown: [{ chainSlug: EXPLORER_URL, volumeUsd: "140000.00", txCount: 300 }],
    });

    expect(markup).not.toContain("basescan.org");
    expect(markup).not.toMatch(/https?:\/\//);
    expect(rowLabels(markup)).toEqual(["unknown protocol", "unknown chain"]);
  });
});

describe("AgentPagePerformance", () => {
  it("states that there are not enough closed round trips instead of a zero win rate", () => {
    const markup = performanceMarkup({ ...agent, winRate: null, closedRoundTrips: 3 });

    expect(markup).toContain("Not enough closed round trips yet");
    expect(markup).not.toContain("%");
  });

  it("shows a zero win rate for an all-losing record above the round trip floor", () => {
    const markup = performanceMarkup({ ...agent, winRate: 0, closedRoundTrips: 9 });

    expect(markup).toContain("0%");
    expect(markup).not.toContain("Not enough closed round trips yet");
  });
});

describe("AgentPageDisclosure", () => {
  it("states a fully priced share rather than staying silent", () => {
    const markup = disclosureMarkup(0, false);

    expect(markup).toContain("0% of this agent");
    expect(markup).toContain("could not be priced and is excluded from USD figures");
  });

  it("states the unpriced share with its single decimal", () => {
    expect(disclosureMarkup(12.5, false)).toContain("12.5% of this agent");
  });

  it("says nothing about truncation when the whole history was read", () => {
    expect(disclosureMarkup(12.5, false)).not.toContain("most recent activities only");
  });

  it("says the figures cover the most recent activities when the read was truncated", () => {
    expect(disclosureMarkup(12.5, true)).toContain("most recent activities only");
  });
});

describe("deployedChartPoints", () => {
  it("places a UTC day at its midnight bucket", () => {
    expect(deployedChartPoints([{ day: "2026-07-11", usd: "1000.00" }])).toEqual([
      { bucketStart: Date.UTC(2026, 6, 11) / 1000, volumeUsd: "1000.00", txCount: 0 },
    ]);
  });

  it("keeps the oldest-first order of the series", () => {
    const points = deployedChartPoints([
      { day: "2026-07-11", usd: "1000.00" },
      { day: "2026-07-12", usd: "2000.00" },
    ]);

    expect(points.map((point) => point.volumeUsd)).toEqual(["1000.00", "2000.00"]);
    expect(points[1]?.bucketStart).toBe(Date.UTC(2026, 6, 12) / 1000);
  });
});
