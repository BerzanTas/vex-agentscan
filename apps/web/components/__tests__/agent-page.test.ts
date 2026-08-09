import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPageDisclosure } from "../AgentPageDisclosure";
import { AgentPagePerformance } from "../AgentPagePerformance";
import { AgentPageView } from "../AgentPageView";
import { AgentPageDeployedChart, deployedChartPoints } from "../AgentPageDeployedChart";
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
  unpriced30dSharePct: 4.2,
  truncated: false,
};

const partlyPricedAgent: AgentPageDto = {
  ...agent,
  capitalDeployedPeak30dUsd: "100",
  dailyDeployedUsd: thirtyDaysDeployed().map((entry, index) => ({
    day: entry.day,
    usd: index === 29 ? "100" : "0",
  })),
  realizedResultUsd: "0",
  closedRoundTrips: 0,
  unmatchedDisposals: 0,
  winRate: null,
  protocolBreakdown: [{ protocol: "kyberswap", volumeUsd: "100", txCount: 1 }],
  chainBreakdown: [{ chainSlug: "base", volumeUsd: "100", txCount: 1 }],
  activityCount: 1,
  activitiesPerDay30d: 0.03,
  unpricedSharePct: 100,
  unpriced30dSharePct: 100,
};

function viewMarkup(page: AgentPageDto): string {
  return renderToStaticMarkup(createElement(AgentPageView, { agent: page }));
}

function performanceMarkup(page: AgentPageDto): string {
  return renderToStaticMarkup(createElement(AgentPagePerformance, { agent: page }));
}

function disclosureMarkup(
  unpricedSharePct: number,
  unpriced30dSharePct: number,
  truncated: boolean,
): string {
  return renderToStaticMarkup(
    createElement(AgentPageDisclosure, { unpricedSharePct, unpriced30dSharePct, truncated }),
  );
}

function chartMarkup(days: AgentPageDto["dailyDeployedUsd"]): string {
  return renderToStaticMarkup(createElement(AgentPageDeployedChart, { days }));
}

function markupWithHostileLabel(label: string): string {
  return viewMarkup({
    ...agent,
    truncated: true,
    protocolBreakdown: [{ protocol: label, volumeUsd: "120400.00", txCount: 240 }],
    chainBreakdown: [{ chainSlug: label, volumeUsd: "140000.00", txCount: 300 }],
  });
}

function disclosureText(markup: string): string {
  return (
    markup.match(/<p class="section-enter max-w-3xl text-xs text-text-muted">(.*?)<\/p>/)?.[1] ?? ""
  );
}

function disposalsNote(markup: string): string {
  return markup.match(/<p class="max-w-3xl text-xs text-text-muted">(.*?)<\/p>/)?.[1] ?? "";
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

  it("dates activity inside the current hour without inventing minutes or seconds", () => {
    const markup = viewMarkup({ ...agent, lastSeenSeconds: 0 });

    expect(markup).toContain("Last seen less than an hour ago");
    expect(markup).not.toMatch(/Last seen \d+[ms] ago/);
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

  it("never states the closed round trip count inside the disposals note", () => {
    const note = disposalsNote(viewMarkup(agent));

    expect(note).toContain("2 disposals");
    expect(note).not.toContain(String(agent.closedRoundTrips));
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

  it("always states both unpriced shares against the figures each one qualifies", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain("12.5% could not be fully priced");
    expect(markup).toContain("Over the trailing 30 days that share is 4.2%");
  });

  it("never calls a figure excluded while that figure is published above the caption", () => {
    const markup = viewMarkup(partlyPricedAgent);

    expect(markup).toContain("100% could not be fully priced");
    expect(markup).toContain('title="$100.00"');
    expect(rowLabels(markup)).toEqual(["kyberswap", "base"]);
    expect(disclosureText(markup)).not.toMatch(/\bexcluded\b/);
    expect(disclosureText(markup)).toContain("not fully reflected");
  });

  it("keeps the exact figures in their titles and carries no estimate badge", () => {
    const markup = viewMarkup(agent);

    expect(markup).toContain('title="$184,320.75"');
    expect(markup).toContain('title="$120,400.00"');
    expect(markup).not.toContain(">est.<");
    expect(markup).not.toMatch(/(^|[\s>])est\./);
  });

  it("renders exactly one breakdown row per entry and no footer row", () => {
    const markup = viewMarkup(agent);

    expect(rowLabels(markup)).toHaveLength(
      agent.protocolBreakdown.length + agent.chainBreakdown.length,
    );
    expect(markup).not.toContain("<tfoot");
  });

  it("renders no transaction hash even when one arrives in a label field", () => {
    const markup = markupWithHostileLabel(TX_HASH);

    expect(markup).not.toMatch(/0x[0-9a-fA-F]{64}/);
    expect(rowLabels(markup)).toEqual(["unknown protocol", "unknown chain"]);
  });

  it("renders no wallet address even when one arrives in a label field", () => {
    const markup = markupWithHostileLabel(EVM_ADDRESS);

    expect(markup).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(rowLabels(markup)).toEqual(["unknown protocol", "unknown chain"]);
  });

  it("renders no explorer link even when one arrives in a label field", () => {
    const markup = markupWithHostileLabel(EXPLORER_URL);

    expect(markup).not.toContain("basescan.org");
    expect(markup).not.toMatch(/https?:\/\//);
    expect(rowLabels(markup)).toEqual(["unknown protocol", "unknown chain"]);
  });

  it("keeps a hostile label out of the page with every conditional branch rendered", () => {
    const markup = markupWithHostileLabel(TX_HASH);

    expect(markup).not.toMatch(/0x[0-9a-fA-F]{64}/);
    expect(markup).toContain("most recent activities only");
    expect(markup).toContain("Over the trailing 30 days that share is 4.2%");
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

  it("never rounds a losing round trip away into a perfect record", () => {
    const markup = performanceMarkup({ ...agent, winRate: 0.996, closedRoundTrips: 250 });

    expect(markup).toContain("99%");
    expect(markup).not.toContain("100%");
  });

  it("shows a perfect record only when every closed round trip won", () => {
    const markup = performanceMarkup({ ...agent, winRate: 1, closedRoundTrips: 12 });

    expect(markup).toContain("100%");
  });

  it("understates a win rate below one percent instead of inventing one", () => {
    const markup = performanceMarkup({ ...agent, winRate: 0.004, closedRoundTrips: 250 });

    expect(markup).toContain("0%");
    expect(markup).not.toContain("1%");
  });

  it("claims no closed round trip when every unmatched disposal matched nothing", () => {
    const note = disposalsNote(
      performanceMarkup({ ...agent, closedRoundTrips: 0, unmatchedDisposals: 3, winRate: null }),
    );

    expect(note).toContain("3 disposals had no matching priced acquisition");
    expect(note.split("closed a round trip")).toHaveLength(2);
    expect(note).toContain("where an acquisition did match, that amount closed a round trip");
  });

  it("keeps the same sentence true when the disposals matched only partially", () => {
    const note = disposalsNote(
      performanceMarkup({ ...agent, closedRoundTrips: 18, unmatchedDisposals: 2 }),
    );

    expect(note).toContain("2 disposals had no matching priced acquisition");
    expect(note).toContain("where an acquisition did match, that amount closed a round trip");
  });

  it("says nothing about disposals when every one of them matched exactly", () => {
    const markup = performanceMarkup({ ...agent, closedRoundTrips: 18, unmatchedDisposals: 0 });

    expect(markup).not.toContain("disposal");
  });

  it("counts a single unmatched disposal in the singular", () => {
    const note = disposalsNote(
      performanceMarkup({ ...agent, closedRoundTrips: 0, unmatchedDisposals: 1 }),
    );

    expect(note).toContain("1 disposal had no matching priced acquisition");
    expect(note).not.toContain("1 disposals");
  });
});

describe("AgentPageDisclosure", () => {
  it("states both fully priced shares rather than staying silent", () => {
    const markup = disclosureMarkup(0, 0, false);

    expect(markup).toContain("0% could not be fully priced");
    expect(markup).toContain("Over the trailing 30 days that share is 0%");
  });

  it("binds the whole-read share to the priced-only figures", () => {
    const markup = disclosureMarkup(12.5, 4.2, false);

    expect(markup).toContain(
      "Of this agent&#x27;s swaps and bridge deposits we have finished pricing, 12.5% could not be fully priced.",
    );
    expect(markup).toContain(
      "Those transactions are not fully reflected in the realized result, the win rate or the breakdown volumes, and are still counted in the transaction counts.",
    );
  });

  it("names the population the share measures and never the wider one", () => {
    const markup = disclosureMarkup(12.5, 4.2, true);

    expect(markup).toContain("swaps and bridge deposits");
    expect(markup).not.toContain("verified activity");
    expect(markup).not.toContain("verified activities");
  });

  it("does not claim unpriced activity is missing from the breakdown transaction counts", () => {
    const markup = disclosureMarkup(12.5, 4.2, false);

    expect(markup).not.toContain("excluded from the realized result and the protocol and chain");
    expect(markup).toContain("still counted in the transaction counts");
  });

  it("binds the trailing thirty day share to the deployed capital and its chart", () => {
    const markup = disclosureMarkup(12.5, 4.2, false);

    expect(markup).toContain(
      "Over the trailing 30 days that share is 4.2%, not fully reflected in the capital deployed figure or the daily chart.",
    );
  });

  it("states a trailing share that a lifetime share would have hidden", () => {
    const markup = disclosureMarkup(5.8, 75, false);

    expect(markup).toContain("5.8% could not be fully priced");
    expect(markup).toContain("Over the trailing 30 days that share is 75%");
  });

  it("says nothing about truncation when the whole history was read", () => {
    expect(disclosureMarkup(12.5, 4.2, false)).not.toContain("most recent activities only");
  });

  it("says the figures cover the most recent activities when the read was truncated", () => {
    expect(disclosureMarkup(12.5, 4.2, true)).toContain("most recent activities only");
  });
});

describe("AgentPageDeployedChart", () => {
  it("says every day rounded to zero rather than claiming there was no activity", () => {
    const markup = chartMarkup(
      Array.from({ length: 30 }, (_unused, index) => ({
        day: new Date(SERIES_FIRST_DAY + index * DAY_MS).toISOString().slice(0, 10),
        usd: "0",
      })),
    );

    expect(markup).toContain("No day in the last 30 reached $0.01 of priced capital deployed");
    expect(markup).not.toContain("chart-frame");
  });

  it("draws the chart as soon as one day carries a priced cent", () => {
    const markup = chartMarkup([
      { day: "2026-07-11", usd: "0" },
      { day: "2026-07-12", usd: "0.01" },
    ]);

    expect(markup).toContain("chart-frame");
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
