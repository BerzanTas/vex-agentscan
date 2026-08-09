import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingCoverageNote } from "../PricingCoverageNote";
import type { PricingCoverageDto } from "../../lib/api";

function markupOf(coverage: PricingCoverageDto): string {
  return renderToStaticMarkup(createElement(PricingCoverageNote, { coverage }));
}

describe("PricingCoverageNote", () => {
  it("states the priced share of what the window has finished pricing", () => {
    const markup = markupOf({
      pricedActivityCount: 30,
      unpricedActivityCount: 10,
      pendingActivityCount: 0,
      pricedCoverage: 0.75,
    });

    expect(markup).toContain("75.0% of the verified activity we have finished pricing");
  });

  it("counts the unpriced and the not yet priced activities as left out", () => {
    const markup = markupOf({
      pricedActivityCount: 30,
      unpricedActivityCount: 8,
      pendingActivityCount: 2,
      pricedCoverage: 0.7894736842105263,
    });

    expect(markup).toContain("10 activities are left out");
    expect(markup).toContain("8 we could not price");
    expect(markup).toContain("2 still being priced");
  });

  it("never claims full coverage while activities are still being priced", () => {
    const markup = markupOf({
      pricedActivityCount: 3,
      unpricedActivityCount: 0,
      pendingActivityCount: 2,
      pricedCoverage: 1,
    });

    expect(markup).toContain("100.0% of the verified activity we have finished pricing");
    expect(markup).toContain("2 activities are left out");
    expect(markup).toContain("2 still being priced");
    expect(markup).not.toContain("we could not price");
  });

  it("renders the disclosure even when everything in the window is priced", () => {
    const markup = markupOf({
      pricedActivityCount: 12,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 1,
    });

    expect(markup).toContain("100.0%");
    expect(markup).toContain("Every verified activity in this window is priced.");
    expect(markup).not.toContain("left out");
  });

  it("says one activity in the singular", () => {
    const markup = markupOf({
      pricedActivityCount: 4,
      unpricedActivityCount: 1,
      pendingActivityCount: 0,
      pricedCoverage: 0.8,
    });

    expect(markup).toContain("1 activity is left out");
    expect(markup).not.toContain("1 activities");
  });

  it("says there is no verified activity rather than nothing priced on an empty window", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 0,
    });

    expect(markup).toContain("No verified activity in this window yet.");
    expect(markup).not.toContain("0.0%");
    expect(markup).not.toContain("left out");
  });

  it("quotes no percentage while the window has finished pricing nothing", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 5,
      pricedCoverage: 0,
    });

    expect(markup).toContain("None of the 5 verified activities in this window has been priced yet");
    expect(markup).not.toContain("0.0%");
  });
});
