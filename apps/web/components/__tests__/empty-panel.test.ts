import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartPanel } from "../ChartPanel";
import { EmptyPanel } from "../EmptyPanel";

describe("EmptyPanel", () => {
  it("pulses a live dot next to the message by default", () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyPanel, { message: "Waiting for the first verified activity" }),
    );

    expect(markup).toContain('class="empty-panel-dot"');
  });

  it("omits the dot when the panel is not a live one", () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyPanel, { message: "No volume in this range", withLiveDot: false }),
    );

    expect(markup).toContain("No volume in this range");
    expect(markup).not.toContain("empty-panel-dot");
  });
});

describe("ChartPanel", () => {
  it("shows the empty range message without a live dot", () => {
    const markup = renderToStaticMarkup(
      createElement(ChartPanel, {
        initialPoints: [{ bucketStart: Date.UTC(2026, 7, 6) / 1000, volumeUsd: "0", txCount: 0 }],
        initialRange: "30d",
      }),
    );

    expect(markup).toContain("No volume in this range");
    expect(markup).not.toContain("empty-panel-dot");
  });
});
