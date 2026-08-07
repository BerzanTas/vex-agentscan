import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline, type SparklinePoint } from "../Sparkline";

const RISING_SERIES: SparklinePoint[] = [
  { bucketStart: 1_754_179_200, volumeUsd: "120.50", txCount: 3 },
  { bucketStart: 1_754_265_600, volumeUsd: "980.00", txCount: 11 },
  { bucketStart: 1_754_352_000, volumeUsd: "4210.75", txCount: 24 },
];

const LABEL = "7d observed volume";

function markup(series: SparklinePoint[] = RISING_SERIES): string {
  return renderToStaticMarkup(createElement(Sparkline, { series, label: LABEL }));
}

describe("Sparkline", () => {
  it("renders one inline svg", () => {
    expect(markup().match(/<svg/g)).toHaveLength(1);
  });

  it("renders the line and the area of the same series", () => {
    expect(markup()).toContain('class="sparkline-area"');
    expect(markup()).toContain('class="sparkline-line"');
  });

  it("carries the sparkline class on the svg", () => {
    expect(markup()).toContain('class="sparkline"');
  });

  it("hides the decoration from assistive technology", () => {
    expect(markup()).toContain('aria-hidden="true"');
  });

  it("carries the label as a title", () => {
    expect(markup()).toContain("<title>7d observed volume</title>");
  });

  it("draws the area closed to the baseline of the box", () => {
    expect(markup()).toContain(
      'class="sparkline-area" d="M 0 24 C 16 23.16 32 22.32 48 18.96 C 64 15.59 80 7.8 96 0 L 96 24 L 0 24 Z"',
    );
  });

  it("draws a rising series ending above where it started", () => {
    expect(markup()).toContain(
      'class="sparkline-line" d="M 0 24 C 16 23.16 32 22.32 48 18.96 C 64 15.59 80 7.8 96 0"',
    );
  });

  it("draws a flat baseline for an empty series", () => {
    expect(markup([])).toContain('class="sparkline-line" d="M 0 24 L 96 24"');
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup()).not.toContain("style=");
  });
});
