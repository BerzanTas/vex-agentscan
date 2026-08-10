import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingCoverageNote, type PricingCoverageScope } from "../PricingCoverageNote";
import type { PricingCoverageDto } from "../../lib/api";

function markupOf(
  coverage: PricingCoverageDto,
  scope: PricingCoverageScope = "these-figures",
): string {
  return renderToStaticMarkup(createElement(PricingCoverageNote, { coverage, scope }));
}

describe("PricingCoverageNote", () => {
  it("states the priced share of what the window has finished pricing", () => {
    const markup = markupOf({
      pricedActivityCount: 30,
      unpricedActivityCount: 10,
      pendingActivityCount: 0,
      pricedCoverage: 0.75,
    });

    expect(markup).toContain("75.0% of the swaps and bridge deposits in this window we have finished pricing");
  });

  it("counts the unpriced and the not yet priced activities as left out", () => {
    const markup = markupOf({
      pricedActivityCount: 30,
      unpricedActivityCount: 8,
      pendingActivityCount: 2,
      pricedCoverage: 0.7894736842105263,
    });

    expect(markup).toContain("10 swaps and bridge deposits are not fully reflected in the USD figures");
    expect(markup).toContain("8 we could not fully price");
    expect(markup).toContain("2 still being priced");
  });

  it("never claims full coverage while activities are still being priced", () => {
    const markup = markupOf({
      pricedActivityCount: 3,
      unpricedActivityCount: 0,
      pendingActivityCount: 2,
      pricedCoverage: 1,
    });

    expect(markup).toContain("100.0% of the swaps and bridge deposits in this window we have finished pricing");
    expect(markup).toContain("2 swaps and bridge deposits are not fully reflected");
    expect(markup).toContain("2 still being priced");
    expect(markup).not.toContain("we could not fully price");
  });

  it("renders the disclosure even when everything in the window is priced", () => {
    const markup = markupOf({
      pricedActivityCount: 12,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 1,
    });

    expect(markup).toContain("100.0%");
    expect(markup).toContain("Every leg of every swap and bridge deposit in this window is priced.");
    expect(markup).not.toContain("not fully reflected");
  });

  it("says one activity in the singular", () => {
    const markup = markupOf({
      pricedActivityCount: 4,
      unpricedActivityCount: 1,
      pendingActivityCount: 0,
      pricedCoverage: 0.8,
    });

    expect(markup).toContain("1 swap or bridge deposit is not fully reflected");
    expect(markup).not.toContain("1 swaps");
  });

  it("reports what coverage can measure rather than claiming the window holds nothing", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });

    expect(markup).toContain("None are on record for this window");
    expect(markup).toContain("the coverage of any figure shown here cannot be measured");
    expect(markup).not.toContain("no verified activity");
    expect(markup).not.toContain("0.0%");
    expect(markup).not.toContain("left out");
  });

  it("never denies holding anything while a purged window still publishes its totals", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });

    expect(markup).not.toContain("no coverage to report");
    expect(markup).not.toContain("It holds none");
  });

  it("quotes no percentage while the window has finished pricing nothing", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 5,
      pricedCoverage: 0,
    });

    expect(markup).toContain("Nothing in this window is priced yet: 5 swaps and bridge deposits still being priced");
    expect(markup).not.toContain("0.0%");
  });

  it("agrees in number when a single activity is still being priced", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 1,
      pricedCoverage: 0,
    });

    expect(markup).toContain("Nothing in this window is priced yet: 1 swap or bridge deposit still being priced");
    expect(markup).not.toContain("1 swaps");
  });
});

describe("PricingCoverageNote on a page whose figures are a slice of what it measures", () => {
  const MIXED: PricingCoverageDto = {
    pricedActivityCount: 99,
    unpricedActivityCount: 1,
    pendingActivityCount: 0,
    pricedCoverage: 0.99,
  };

  it("says the share is explorer-wide before it says the number", () => {
    const markup = markupOf(MIXED, "the-whole-explorer");

    expect(markup).toContain(
      "Across the whole explorer in this window — not only the figures on this page —",
    );
    expect(markup.indexOf("Across the whole explorer")).toBeLessThan(markup.indexOf("99.0%"));
  });

  it("never claims the share describes only what the page shows", () => {
    const markup = markupOf(MIXED, "the-whole-explorer");

    expect(markup).not.toContain("of the swaps and bridge deposits in this window we have finished");
  });

  it("scopes the not-yet-priced sentence the same way", () => {
    const markup = markupOf(
      {
        pricedActivityCount: 0,
        unpricedActivityCount: 0,
        pendingActivityCount: 4,
        pricedCoverage: 0,
      },
      "the-whole-explorer",
    );

    expect(markup).toContain("Across the whole explorer in this window");
    expect(markup).toContain("nothing is priced yet: 4 swaps and bridge deposits still being priced");
    expect(markup).not.toContain("Nothing in this window is priced yet");
  });

  it("leaves a listing page saying nothing about the explorer, because its figures are the explorer", () => {
    const markup = markupOf(MIXED);

    expect(markup).toContain("cover 99.0% of the swaps and bridge deposits in this window");
    expect(markup).not.toContain("Across the whole explorer");
  });
});
