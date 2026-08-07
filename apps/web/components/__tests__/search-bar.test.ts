import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

const {
  SearchBar,
  IDLE_SEARCH_FEEDBACK,
  NO_MATCH_PRIMARY,
  NO_MATCH_SECONDARY,
  missShakePhase,
  nextSearchFeedback,
} = await import("../SearchBar");

describe("nextSearchFeedback", () => {
  it("shows the readout on a miss", () => {
    expect(nextSearchFeedback(IDLE_SEARCH_FEEDBACK, "miss")).toEqual({
      noMatch: true,
      missCount: 1,
    });
  });

  it("advances the miss counter on a repeated miss so the readout remounts", () => {
    expect(nextSearchFeedback({ noMatch: true, missCount: 1 }, "miss")).toEqual({
      noMatch: true,
      missCount: 2,
    });
  });

  it("clears the readout when the visitor types again", () => {
    expect(nextSearchFeedback({ noMatch: true, missCount: 2 }, "typing")).toEqual({
      noMatch: false,
      missCount: 2,
    });
  });

  it("resets the feedback entirely once a lookup succeeds", () => {
    expect(nextSearchFeedback({ noMatch: true, missCount: 3 }, "found")).toEqual({
      noMatch: false,
      missCount: 0,
    });
  });
});

describe("missShakePhase", () => {
  it("keeps the input still while the readout is hidden", () => {
    expect(missShakePhase(IDLE_SEARCH_FEEDBACK)).toBeUndefined();
  });

  it("shakes on phase a after an odd miss", () => {
    expect(missShakePhase({ noMatch: true, missCount: 1 })).toBe("a");
  });

  it("alternates to phase b on the following miss", () => {
    expect(missShakePhase({ noMatch: true, missCount: 2 })).toBe("b");
  });
});

describe("readout copy", () => {
  it("pairs the mono status line with a plain-language explanation", () => {
    expect(NO_MATCH_PRIMARY).toBe("NO MATCH");
    expect(NO_MATCH_SECONDARY).toBe("Nothing indexed for that hash or activity id");
  });
});

describe("SearchBar", () => {
  it("keeps a polite live region mounted in the hero variant", () => {
    expect(renderToStaticMarkup(createElement(SearchBar))).toContain('role="status"');
  });

  it("keeps a polite live region mounted in the compact variant", () => {
    expect(renderToStaticMarkup(createElement(SearchBar, { variant: "compact" }))).toContain(
      'role="status"',
    );
  });

  it("reserves the hero readout slot so a miss never shifts the page", () => {
    expect(renderToStaticMarkup(createElement(SearchBar))).toContain(
      'class="search-readout-slot"',
    );
  });

  it("anchors the compact readout as a dropdown under the input", () => {
    expect(renderToStaticMarkup(createElement(SearchBar, { variant: "compact" }))).toContain(
      'class="search-compact-readout"',
    );
  });

  it("no longer paints the warning-orange note", () => {
    expect(renderToStaticMarkup(createElement(SearchBar))).not.toContain("text-warning");
  });

  it("hides the readout until a lookup misses", () => {
    expect(renderToStaticMarkup(createElement(SearchBar))).not.toContain(NO_MATCH_PRIMARY);
  });
});
