import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NavLink } from "../NavLink";
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

function anchorWithHref(markup: string, href: string): string {
  return markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? "";
}

function navLinkMarkupOn(pathname: string, href: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(NavLink, { href, children: "Tokens" }));
}

function topBarSearchMarkupOn(pathname: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(TopBarSearch));
}

describe("TopBar", () => {
  it("links to the activity page", () => {
    expect(topBarMarkupOn("/")).toContain('href="/activity"');
  });

  it("links to the tokens page", () => {
    expect(topBarMarkupOn("/")).toContain('href="/tokens"');
  });

  it("links to the networks page", () => {
    expect(topBarMarkupOn("/")).toContain('href="/networks"');
  });

  it("groups the three rankings destinations behind one menu", () => {
    const markup = topBarMarkupOn("/");

    expect(markup).toContain('href="/agents"');
    expect(markup).toContain('href="/protocols"');
    expect(markup).toContain('href="/verification"');
  });

  it("marks the section the visitor is in", () => {
    const markup = topBarMarkupOn("/networks/base");

    expect(anchorWithHref(markup, "/networks")).toContain("topbar-nav-link-active");
    expect(anchorWithHref(markup, "/tokens")).not.toContain("topbar-nav-link-active");
  });

  it("no longer links to the retired methodology page", () => {
    expect(topBarMarkupOn("/")).not.toContain("/methodology");
  });

  it("keeps the live indicator", () => {
    const markup = topBarMarkupOn("/");

    expect(markup).toContain('class="live-dot"');
    expect(markup).toContain("LIVE");
  });

  it("frames the live indicator as a bracketed HUD chip", () => {
    expect(topBarMarkupOn("/")).toContain('class="live-chip');
  });

  it("hooks the home link into the HUD logo glow", () => {
    expect(topBarMarkupOn("/")).toContain('class="topbar-logo');
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

describe("NavLink", () => {
  it("stays lit on a detail page below its section", () => {
    expect(navLinkMarkupOn("/tokens/base/0xabc", "/tokens")).toContain("topbar-nav-link-active");
  });

  it("treats a route that merely shares a prefix as another section", () => {
    expect(navLinkMarkupOn("/tokensale", "/tokens")).not.toContain("topbar-nav-link-active");
  });

  it("keeps the root link dark on every other route", () => {
    expect(navLinkMarkupOn("/activity", "/")).not.toContain("topbar-nav-link-active");
  });

  it("announces the exact page, not the whole section", () => {
    expect(navLinkMarkupOn("/tokens", "/tokens")).toContain('aria-current="page"');
    expect(navLinkMarkupOn("/tokens/base/0xabc", "/tokens")).not.toContain("aria-current");
  });
});

describe("TopBarSearch", () => {
  it("stays out of the top bar on the dashboard, where the hero owns the search", () => {
    expect(topBarSearchMarkupOn("/")).toBe("");
  });

  it("offers the compact search on the activity page", () => {
    expect(topBarSearchMarkupOn("/activity")).toContain('class="search-compact-input"');
  });

  it("offers the compact search on a transaction detail page", () => {
    expect(topBarSearchMarkupOn("/tx/pub-1")).toContain('class="search-compact-input"');
  });

  it("never puts the hero-sized field and its button in the top bar", () => {
    const markup = topBarSearchMarkupOn("/activity");

    expect(markup).not.toContain('class="search-input"');
    expect(markup).not.toContain("cobalt-button");
  });
});
