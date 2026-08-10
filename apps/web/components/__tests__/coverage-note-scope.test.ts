import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_APP = new URL("../../app/", import.meta.url);

const SUBJECT_SCOPED_PAGES = [
  "networks/[slug]/page.tsx",
  "tokens/[chainSlug]/[address]/page.tsx",
] as const;

const EXPLORER_WIDE_PAGES = [
  "page.tsx",
  "agents/page.tsx",
  "protocols/page.tsx",
  "tokens/page.tsx",
  "networks/page.tsx",
] as const;

function pageSource(pagePath: string): string {
  return readFileSync(fileURLToPath(new URL(pagePath, WEB_APP)), "utf8");
}

describe("the coverage note's scope on every page that mounts it", () => {
  for (const pagePath of SUBJECT_SCOPED_PAGES) {
    it(`tells the reader the share is explorer-wide on ${pagePath}`, () => {
      expect(pageSource(pagePath)).toContain(
        '<PricingCoverageNote coverage={coverage} scope="the-whole-explorer" />',
      );
    });
  }

  for (const pagePath of EXPLORER_WIDE_PAGES) {
    it(`keeps the share unqualified on ${pagePath}, whose figures are the explorer`, () => {
      expect(pageSource(pagePath)).toContain(
        '<PricingCoverageNote coverage={coverage} scope="these-figures" />',
      );
    });
  }
});
