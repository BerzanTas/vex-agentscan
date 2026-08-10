import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityFilters as SelectedActivityFilters } from "../../lib/api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/activity",
  useRouter: () => ({ replace: () => {} }),
}));

const { ActivityFilters, hasActiveActivityFilter } = await import("../ActivityFilters");

function markup(filters: SelectedActivityFilters): string {
  return renderToStaticMarkup(
    createElement(ActivityFilters, { filters, protocols: ["kyberswap"], chains: ["base"] }),
  );
}

describe("hasActiveActivityFilter", () => {
  it("reports no active filter for an empty selection", () => {
    expect(hasActiveActivityFilter({})).toBe(false);
  });

  it("reports an active filter once a value is set", () => {
    expect(hasActiveActivityFilter({ kind: "swap" })).toBe(true);
  });

  it("ignores empty-string values", () => {
    expect(hasActiveActivityFilter({ protocol: "", chain: "" })).toBe(false);
  });
});

describe("ActivityFilters", () => {
  it("labels every select field", () => {
    const rendered = markup({});

    expect(rendered).toContain(">Kind</span>");
    expect(rendered).toContain(">Protocol</span>");
    expect(rendered).toContain(">Chain</span>");
    expect(rendered).toContain(">Status</span>");
    expect(rendered).toContain(">Verification</span>");
  });

  it("offers every activity kind the contract can report", () => {
    const rendered = markup({});

    for (const kind of ["swap", "bridge", "lend", "prediction", "wrap", "yield", "launch"]) {
      expect(rendered).toContain(`<option value="${kind}">`);
    }
  });

  it("offers the superseded status beside the three it already offered", () => {
    const rendered = markup({});

    for (const status of ["pending", "confirmed", "definitively_failed", "superseded_unproven"]) {
      expect(rendered).toContain(`<option value="${status}">`);
    }
  });

  it("marks only the fields with a selected value as active", () => {
    const rendered = markup({ kind: "swap", status: "confirmed" });

    expect(rendered.match(/data-active="true"/g)).toHaveLength(2);
  });

  it("disables the clear chip while no filter is set", () => {
    expect(markup({})).toContain('disabled=""');
  });

  it("enables the clear chip once a filter is set", () => {
    expect(markup({ chain: "base" })).not.toContain("disabled");
  });

  it("shows the active-filter count in the clear label", () => {
    expect(markup({ kind: "swap", status: "confirmed" })).toContain("Clear filters (2)");
  });

  it("omits the count from the clear label at zero active filters", () => {
    expect(markup({})).toContain(">Clear filters</button>");
  });
});
