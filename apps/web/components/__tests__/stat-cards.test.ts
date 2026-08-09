import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChartPointDto, StatsDto } from "../../lib/api";
import { StatCards } from "../StatCards";

const STATS: StatsDto = {
  dailyVolumeUsd: "1250.75",
  totalVolumeUsd: "15600000",
  dailyTx: 12,
  totalTx: 5271,
  activeAgents7d: 5,
};

const SERIES: ChartPointDto[] = [
  { bucketStart: 1_754_179_200, volumeUsd: "100.50", txCount: 3 },
  { bucketStart: 1_754_265_600, volumeUsd: "200.25", txCount: 5 },
  { bucketStart: 1_754_352_000, volumeUsd: "300.25", txCount: 7 },
];

function markup(stats: StatsDto = STATS, series: ChartPointDto[] = SERIES): string {
  return renderToStaticMarkup(createElement(StatCards, { stats, series }));
}

describe("StatCards", () => {
  it("renders every stat as a cell of one console", () => {
    expect(markup().match(/class="stat-cell"/g)).toHaveLength(5);
  });

  it("groups the cells into a single panel", () => {
    expect(markup().match(/stat-console-grid/g)).toHaveLength(1);
  });

  it("labels each of the five stats", () => {
    const html = markup();
    expect(html).toContain("Daily volume");
    expect(html).toContain("Total volume");
    expect(html).toContain("Daily txns");
    expect(html).toContain("Total txns");
    expect(html).toContain("Active agents");
  });

  it("renders usd values in compact form", () => {
    expect(markup()).toContain("$15.6M");
  });

  it("carries the exact usd value as the cell title", () => {
    expect(markup()).toContain('title="$15,600,000.00"');
  });

  it("groups counts with thousands separators", () => {
    expect(markup()).toContain("5,271");
  });

  it("carries no estimate badge on the priced usd totals", () => {
    expect(markup()).not.toContain("stat-cell-unit");
  });

  it("draws a trend for every stat that has a series", () => {
    expect(markup().match(/class="stat-spark"/g)).toHaveLength(4);
  });

  it("titles the trend with the stat it belongs to", () => {
    expect(markup()).toContain("<title>Daily volume over 30D</title>");
  });

  it("shows the observation window instead of a trend for active agents", () => {
    expect(markup()).toContain("7D window");
  });

  it("renders the console without a series", () => {
    expect(markup(STATS, []).match(/class="stat-cell"/g)).toHaveLength(5);
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup()).not.toContain("style=");
  });
});
