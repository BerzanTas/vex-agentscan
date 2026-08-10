import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteFooter } from "../SiteFooter";

function markup(): string {
  return renderToStaticMarkup(createElement(SiteFooter));
}

describe("SiteFooter", () => {
  it("links to the activity page", () => {
    expect(markup()).toContain('href="/activity"');
  });

  it("links to the companion product site in a new tab without leaking the referrer opener", () => {
    const rendered = markup();

    expect(rendered).toContain('href="https://projectvex.ai"');
    expect(rendered).toContain('rel="noopener"');
  });

  it("describes the reported activity without narrowing it to swaps and bridges", () => {
    const rendered = markup();

    expect(rendered).toContain("On-chain actions reported by Vex installations");
    expect(rendered).not.toContain("Swaps and bridges reported by Vex installations");
  });

  it("separates the client estimate of a single activity from the priced aggregates", () => {
    expect(markup()).toContain("Per-activity USD figures are client estimates captured at quote time");
    expect(markup()).toContain(
      "aggregate USD figures are priced by AgentScan from its own historical lookups",
    );
  });

  it("names the label a per-activity estimate carries in the tables", () => {
    expect(markup()).toContain("are labeled &quot;est.&quot;");
  });

  it("says the priced aggregates may not cover every activity", () => {
    expect(markup()).toContain("may not cover every activity");
  });

  it("states that activity is verified on-chain", () => {
    expect(markup()).toContain("Activity is reported by Vex installations and verified on-chain");
  });

  it("is the only place the coverage share used to be explained, so it carries no percentage", () => {
    expect(markup()).not.toContain("priced by AgentScan and cover");
  });

  it("ships both logo variants so CSS can pick one per theme", () => {
    const rendered = markup();

    expect(rendered).toContain('src="/logo-dark.svg"');
    expect(rendered).toContain('src="/logo-light.svg"');
  });

  it("carries a fixed copyright year rather than a build-time clock", () => {
    expect(markup()).toContain("© 2026 Vex");
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup()).not.toContain("style=");
  });
});

describe("SiteFooter navigation", () => {
  it("links to every page the navbar offers, so the footer cannot fall behind it", () => {
    const rendered = markup();

    for (const href of ["/tokens", "/networks", "/agents", "/protocols", "/verification"]) {
      expect(rendered).toContain(`href="${href}"`);
    }
  });
});
