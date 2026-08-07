import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeading } from "../PageHeading";

function markup(props: Parameters<typeof PageHeading>[0]): string {
  return renderToStaticMarkup(createElement(PageHeading, props));
}

describe("PageHeading", () => {
  it("renders the kicker and exactly one h1 carrying the title", () => {
    const rendered = markup({ kicker: "REGISTRY // NETWORKS", title: "Networks" });

    expect(rendered).toContain("REGISTRY // NETWORKS");
    expect(rendered.match(/<h1/g)).toHaveLength(1);
    expect(rendered).toContain(">Networks</h1>");
  });

  it("renders the description only when one is given", () => {
    const withDescription = markup({
      kicker: "REGISTRY // TOKENS",
      title: "Tokens",
      description: "Tokens swapped and bridged by Vex agents.",
    });
    const withoutDescription = markup({ kicker: "PIPELINE // VERIFICATION", title: "Verification" });

    expect(withDescription).toContain("Tokens swapped and bridged by Vex agents.");
    expect(withDescription).toContain("page-heading-description");
    expect(withoutDescription).not.toContain("page-heading-description");
  });

  it("renders the actions slot only when one is given", () => {
    const withActions = markup({
      kicker: "RANKING // AGENTS",
      title: "Top agents",
      actions: createElement("span", null, "range chips"),
    });
    const withoutActions = markup({ kicker: "LIVE FEED // ACTIVITY", title: "Activity" });

    expect(withActions).toContain("range chips");
    expect(withActions).toContain("page-heading-actions");
    expect(withoutActions).not.toContain("page-heading-actions");
  });

  it("hides the decorative rule from assistive tech", () => {
    const rendered = markup({ kicker: "SYSTEM // STATUS", title: "Status" });

    expect(rendered).toContain("page-heading-rule");
    expect(rendered).toContain('aria-hidden="true"');
  });

  it("carries no inline style attribute the production CSP would block", () => {
    const rendered = markup({
      kicker: "NETWORK // DETAIL",
      title: "Base",
      description: "Agent activity observed on Base.",
      actions: createElement("span", null, "24H"),
    });

    expect(rendered).not.toContain("style=");
  });
});
