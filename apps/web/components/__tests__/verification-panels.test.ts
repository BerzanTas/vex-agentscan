import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChainTierDto, VerificationStatsDto } from "../../lib/api";
import { VerificationPanels } from "../VerificationPanels";

const REGISTRY_CHAINS: ChainTierDto[] = [
  { chainSlug: "base", displayName: "Base", verificationTier: "full" },
  { chainSlug: "solana", displayName: "Solana", verificationTier: "basic" },
];

const MEASURED_STATS: VerificationStatsDto = {
  verifiedFull: 30,
  verifiedBasic: 10,
  queued: 4,
  latencySeconds: { median: 12, p90: 90 },
  chains: REGISTRY_CHAINS,
};

const EMPTY_DATABASE_STATS: VerificationStatsDto = {
  verifiedFull: 0,
  verifiedBasic: 0,
  queued: 0,
  latencySeconds: { median: null, p90: null },
  chains: REGISTRY_CHAINS,
};

function markup(stats: VerificationStatsDto): string {
  return renderToStaticMarkup(createElement(VerificationPanels, { stats }));
}

function statValueFor(rendered: string, label: string): string {
  const fromLabel = rendered.slice(rendered.indexOf(label));
  return /class="verification-stat-value">([^<]*)</.exec(fromLabel)?.[1] ?? "";
}

function tableBodyOf(rendered: string): string {
  return /<tbody>(.*)<\/tbody>/.exec(rendered)?.[1] ?? "";
}

describe("VerificationPanels", () => {
  it("explains in one sentence how full verification differs from basic", () => {
    expect(markup(MEASURED_STATS)).toContain(
      "Full verification compares the amounts recorded on chain; basic verification confirms only that the transaction exists and when it happened.",
    );
  });

  it("shows both verified counts and their proportion", () => {
    const rendered = markup(MEASURED_STATS);

    expect(statValueFor(rendered, "Full verification")).toBe("30");
    expect(statValueFor(rendered, "Basic verification")).toBe("10");
    expect(rendered).toContain("75%");
    expect(rendered).toContain("25%");
  });

  it("renders a dash rather than a zero when no verification latency has been measured", () => {
    const rendered = markup(EMPTY_DATABASE_STATS);

    expect(statValueFor(rendered, "Median verification latency")).toBe("—");
    expect(statValueFor(rendered, "90th percentile latency")).toBe("—");
  });

  it("renders the measured verification latency", () => {
    const rendered = markup(MEASURED_STATS);

    expect(statValueFor(rendered, "Median verification latency")).toBe("12.0s");
    expect(statValueFor(rendered, "90th percentile latency")).toBe("1m 30s");
  });

  it("reports how many activities wait in the verification queue", () => {
    expect(statValueFor(markup(MEASURED_STATS), "Waiting in verification queue")).toBe("4");
  });

  it("lists every registry chain with its tier badge", () => {
    const rendered = markup(MEASURED_STATS);
    const body = tableBodyOf(rendered);

    const tiers = [...body.matchAll(/class="tier-badge tier-badge-(\w+)"/g)].map((hit) => hit[1]);

    expect(body.match(/<tr/g)).toHaveLength(2);
    expect(tiers).toEqual(["full", "basic"]);
    expect(body).toContain("Base");
    expect(body).toContain("Solana");
  });

  it("still states which chains we can verify when nothing has been verified yet", () => {
    const body = tableBodyOf(markup(EMPTY_DATABASE_STATS));

    expect(body.match(/<tr/g)).toHaveLength(2);
    expect(body).toContain("tier-badge-full");
    expect(body).toContain("tier-badge-basic");
  });

  it("publishes no mismatch counter and no strike counter", () => {
    const rendered = markup(MEASURED_STATS).toLowerCase();

    expect(rendered).not.toContain("mismatch");
    expect(rendered).not.toContain("strike");
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup(MEASURED_STATS)).not.toContain("style=");
  });
});
