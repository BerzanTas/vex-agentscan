import { describe, expect, it } from "vitest";
import { chartPalette } from "../chart-theme";

describe("chartPalette", () => {
  it("lifts the trace off the dark canvas and keeps brand cobalt on light", () => {
    expect(chartPalette("cobalt").lineColor).toBe("#4d6bff");
    expect(chartPalette("light").lineColor).toBe("#1f44ff");
  });

  it("uses muted light text and a barely there grid in the cobalt theme", () => {
    expect(chartPalette("cobalt").textColor).toBe("#939aad");
    expect(chartPalette("cobalt").gridColor).toBe("rgba(31, 68, 255, 0.12)");
  });

  it("uses muted dark text and a barely there grid in the light theme", () => {
    expect(chartPalette("light").textColor).toBe("#666e8b");
    expect(chartPalette("light").gridColor).toBe("rgba(31, 68, 255, 0.1)");
  });

  it("fades the area fill to fully transparent at the baseline in both themes", () => {
    expect(chartPalette("cobalt").topColor).toBe("rgba(77, 107, 255, 0.42)");
    expect(chartPalette("cobalt").bottomColor).toBe("rgba(31, 68, 255, 0)");
    expect(chartPalette("light").topColor).toBe("rgba(31, 68, 255, 0.24)");
    expect(chartPalette("light").bottomColor).toBe("rgba(31, 68, 255, 0)");
  });

  it("labels the crosshair on a cobalt chip in both themes", () => {
    expect(chartPalette("cobalt").labelBackground).toBe("#1f44ff");
    expect(chartPalette("cobalt").labelText).toBe("#f3f4f7");
    expect(chartPalette("light").labelBackground).toBe("#1f44ff");
    expect(chartPalette("light").labelText).toBe("#ffffff");
  });

  it("draws the crosshair itself in a lighter cobalt so it never hides the trace", () => {
    expect(chartPalette("cobalt").crosshairColor).toBe("rgba(127, 150, 255, 0.7)");
    expect(chartPalette("light").crosshairColor).toBe("rgba(31, 68, 255, 0.55)");
  });
});
