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

  it("keeps the estimate disclaimer that the old one-line footer carried", () => {
    expect(markup()).toContain("All USD values are estimates");
  });

  it("states that activity is verified on-chain", () => {
    expect(markup()).toContain("verified on-chain");
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
