import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NavMenu, nextNavMenuIndex } from "../NavMenu";

const routing = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routing.pathname,
}));

function navMenuMarkupOn(pathname: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(NavMenu));
}

function anchorWithHref(markup: string, href: string): string {
  return markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? "";
}

describe("NavMenu", () => {
  it("offers the three rankings destinations", () => {
    const markup = navMenuMarkupOn("/");

    expect(markup).toContain('href="/agents"');
    expect(markup).toContain('href="/protocols"');
    expect(markup).toContain('href="/verification"');
    expect(markup.match(/class="nav-menu-item"/g)).toHaveLength(3);
  });

  it("starts collapsed", () => {
    expect(navMenuMarkupOn("/")).toContain('aria-expanded="false"');
  });

  it("hides the panel it keeps mounted so aria-controls always resolves", () => {
    const markup = navMenuMarkupOn("/");

    expect(markup).toContain('aria-controls="nav-menu-rankings"');
    expect(markup).toMatch(/<div id="nav-menu-rankings"[^>]*hidden=""/);
  });

  it("opens with a button rather than a link to nowhere", () => {
    expect(navMenuMarkupOn("/")).toContain('<button type="button"');
  });

  it("marks the destination the visitor is already on", () => {
    const markup = navMenuMarkupOn("/protocols");

    expect(anchorWithHref(markup, "/protocols")).toContain('aria-current="page"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("leaves every destination unmarked outside the menu's routes", () => {
    expect(navMenuMarkupOn("/tokens")).not.toContain('aria-current="page"');
  });

  it("lights the trigger while the visitor is on one of its routes", () => {
    expect(navMenuMarkupOn("/verification")).toContain("topbar-nav-link-active");
  });

  it("leaves the trigger dark elsewhere", () => {
    expect(navMenuMarkupOn("/tokens")).not.toContain("topbar-nav-link-active");
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(navMenuMarkupOn("/agents")).not.toContain("style=");
  });
});

describe("nextNavMenuIndex", () => {
  it("enters the panel at the first item when the trigger is focused", () => {
    expect(nextNavMenuIndex("ArrowDown", -1, 3)).toBe(0);
  });

  it("enters the panel at the last item when arrowing up from the trigger", () => {
    expect(nextNavMenuIndex("ArrowUp", -1, 3)).toBe(2);
  });

  it("steps down through the items", () => {
    expect(nextNavMenuIndex("ArrowDown", 0, 3)).toBe(1);
  });

  it("wraps from the last item to the first", () => {
    expect(nextNavMenuIndex("ArrowDown", 2, 3)).toBe(0);
  });

  it("wraps from the first item to the last", () => {
    expect(nextNavMenuIndex("ArrowUp", 0, 3)).toBe(2);
  });

  it("jumps to the first item on Home", () => {
    expect(nextNavMenuIndex("Home", 2, 3)).toBe(0);
  });

  it("jumps to the last item on End", () => {
    expect(nextNavMenuIndex("End", 0, 3)).toBe(2);
  });
});
