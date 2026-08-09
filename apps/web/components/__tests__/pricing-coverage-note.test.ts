import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingCoverageNote } from "../PricingCoverageNote";
import type { PricingCoverageDto } from "../../lib/api";

function markupOf(coverage: PricingCoverageDto): string {
  return renderToStaticMarkup(createElement(PricingCoverageNote, { coverage }));
}

describe("PricingCoverageNote", () => {
  it("states the priced share of the window as a percentage", () => {
    const markup = markupOf({
      pricedActivityCount: 30,
      unpricedActivityCount: 10,
      pendingActivityCount: 0,
      pricedCoverage: 0.75,
    });

    expect(markup).toContain("75.0%");
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
    expect(markup).toContain("2 not priced yet");
  });

  it("renders the disclosure even when everything in the window is priced", () => {
    const markup = markupOf({
      pricedActivityCount: 12,
      unpricedActivityCount: 0,
      pendingActivityCount: 0,
      pricedCoverage: 1,
    });

    expect(markup).toContain("100.0%");
    expect(markup).toContain("0 activities are left out");
  });

  it("renders zero coverage on a window where nothing is priced yet", () => {
    const markup = markupOf({
      pricedActivityCount: 0,
      unpricedActivityCount: 0,
      pendingActivityCount: 5,
      pricedCoverage: 0,
    });

    expect(markup).toContain("0.0%");
    expect(markup).toContain("5 activities are left out");
  });
});
