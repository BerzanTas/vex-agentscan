import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentsSummary } from "../AgentsSummary";

function markup(totalAllTime: number, totalInWindow: number, range: "24h" | "7d" | "30d" | "all"): string {
  return renderToStaticMarkup(createElement(AgentsSummary, { totalAllTime, totalInWindow, range }));
}

describe("AgentsSummary", () => {
  it("shows the all-time count on the ALL window", () => {
    const html = markup(1284, 12, "30d");

    expect(html).toContain("Agents");
    expect(html).toContain("ALL");
    expect(html).toContain("1,284");
  });

  it("shows the in-window count on the selected range label", () => {
    const html = markup(1284, 12, "30d");

    expect(html).toContain("In this window");
    expect(html).toContain("30D");
    expect(html).toContain("12");
  });

  it("labels the 24h window as 24H", () => {
    expect(markup(10, 3, "24h")).toContain("24H");
  });
});
