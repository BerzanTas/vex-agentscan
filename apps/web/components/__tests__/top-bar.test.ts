import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TopBar } from "../TopBar";
import { TopBarSearch } from "../TopBarSearch";

const routing = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routing.pathname,
  useRouter: () => ({ push: () => {} }),
}));

function topBarMarkupOn(pathname: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(TopBar));
}

function topBarSearchMarkupOn(pathname: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(TopBarSearch));
}

describe("TopBar", () => {
  it("links to the activity page", () => {
    expect(topBarMarkupOn("/")).toContain('href="/activity"');
  });

  it("no longer links to the retired methodology page", () => {
    expect(topBarMarkupOn("/")).not.toContain("/methodology");
  });

  it("keeps the live indicator", () => {
    const markup = topBarMarkupOn("/");

    expect(markup).toContain('class="live-dot"');
    expect(markup).toContain("LIVE");
  });

  it("ships both theme logos so the browser swaps them without a flicker", () => {
    const markup = topBarMarkupOn("/");

    expect(markup).toContain('src="/logo-dark.svg"');
    expect(markup).toContain('src="/logo-light.svg"');
  });

  it("names the home link for assistive technology", () => {
    expect(topBarMarkupOn("/")).toContain('aria-label="AgentScan"');
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(topBarMarkupOn("/activity")).not.toContain("style=");
  });
});

describe("TopBarSearch", () => {
  it("stays out of the top bar on the dashboard, where the hero owns the search", () => {
    expect(topBarSearchMarkupOn("/")).toBe("");
  });

  it("offers the search on the activity page", () => {
    expect(topBarSearchMarkupOn("/activity")).toContain('class="search-input"');
  });

  it("offers the search on a transaction detail page", () => {
    expect(topBarSearchMarkupOn("/tx/pub-1")).toContain('class="search-input"');
  });
});
