import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tokens",
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => new URLSearchParams(""),
}));

const { RangeChips } = await import("../RangeChips");

function markup(current: "24h" | "7d" | "30d" | "all"): string {
  return renderToStaticMarkup(createElement(RangeChips, { current, label: "Token range" }));
}

describe("RangeChips", () => {
  it("offers the four ranges the chart already uses", () => {
    const rendered = markup("30d");

    expect(rendered).toContain(">24H<");
    expect(rendered).toContain(">7D<");
    expect(rendered).toContain(">30D<");
    expect(rendered).toContain(">ALL<");
  });

  it("presses only the current range", () => {
    const rendered = markup("7d");

    expect(rendered.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(rendered.match(/aria-pressed="false"/g)).toHaveLength(3);
  });

  it("names the group so the chips are not four bare buttons for a screen reader", () => {
    expect(markup("24h")).toContain('aria-label="Token range"');
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup("all")).not.toContain("style=");
  });
});
