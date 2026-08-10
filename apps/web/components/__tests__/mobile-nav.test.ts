import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MobileNav } from "../MobileNav";
import { TopBar } from "../TopBar";

const routing = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => routing.pathname,
  useRouter: () => ({ push: () => {} }),
}));

function mobileNavMarkupOn(pathname: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(MobileNav));
}

function topBarMarkupOn(pathname: string): string {
  routing.pathname = pathname;
  return renderToStaticMarkup(createElement(TopBar));
}

function anchorWithHref(markup: string, href: string): string {
  return markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`))?.[0] ?? "";
}

describe("MobileNav", () => {
  it("opens with a button wired to the panel it controls", () => {
    const markup = mobileNavMarkupOn("/");

    expect(markup).toContain('<button type="button" class="mobile-nav-trigger"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="mobile-nav-routes"');
  });

  it("hides the panel it keeps mounted so aria-controls always resolves", () => {
    expect(mobileNavMarkupOn("/")).toMatch(/<nav id="mobile-nav-routes"[^>]*hidden=""/);
  });

  it("carries every destination the footer offers", () => {
    const markup = mobileNavMarkupOn("/");

    expect(anchorWithHref(markup, "/")).toContain("mobile-nav-item");
    expect(anchorWithHref(markup, "/activity")).toContain("mobile-nav-item");
    expect(anchorWithHref(markup, "/tokens")).toContain("mobile-nav-item");
    expect(anchorWithHref(markup, "/networks")).toContain("mobile-nav-item");
    expect(anchorWithHref(markup, "/agents")).toContain("mobile-nav-item");
    expect(anchorWithHref(markup, "/protocols")).toContain("mobile-nav-item");
    expect(anchorWithHref(markup, "/verification")).toContain("mobile-nav-item");
    expect(markup.match(/class="mobile-nav-item/g)).toHaveLength(7);
  });

  it("announces the exact page, not the whole section", () => {
    const markup = mobileNavMarkupOn("/tokens/base/0xabc");

    expect(anchorWithHref(markup, "/tokens")).toContain("mobile-nav-item-current");
    expect(markup).not.toContain('aria-current="page"');
  });

  it("marks the destination the visitor is already on", () => {
    const markup = mobileNavMarkupOn("/networks");

    expect(anchorWithHref(markup, "/networks")).toContain('aria-current="page"');
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("keeps the overview link dark on every other route", () => {
    expect(anchorWithHref(mobileNavMarkupOn("/activity"), "/")).not.toContain(
      "mobile-nav-item-current",
    );
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(mobileNavMarkupOn("/agents")).not.toContain("style=");
  });
});

describe("TopBar responsive navigation", () => {
  it("hands small viewports the menu trigger", () => {
    expect(topBarMarkupOn("/activity")).toContain('class="mobile-nav lg:hidden"');
  });

  it("still ships the wide-viewport nav, hidden by CSS rather than dropped", () => {
    expect(topBarMarkupOn("/activity")).toContain(
      '<nav class="hidden shrink-0 items-center gap-6 lg:flex">',
    );
  });

  it("holds the compact search back until the wide nav appears", () => {
    expect(topBarMarkupOn("/activity")).toContain('class="hidden lg:block"');
  });

  it("keeps the section marker on the wide nav link, not the menu item", () => {
    expect(anchorWithHref(topBarMarkupOn("/networks/base"), "/networks")).toContain(
      "topbar-nav-link-active",
    );
  });
});
