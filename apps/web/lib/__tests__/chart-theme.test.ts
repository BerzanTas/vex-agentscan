import { describe, expect, it } from "vitest";
import { chartPalette } from "../chart-theme";

describe("chartPalette", () => {
  it("keeps the cobalt line colour in both themes", () => {
    expect(chartPalette("cobalt").lineColor).toBe("#1f44ff");
    expect(chartPalette("light").lineColor).toBe("#1f44ff");
  });

  it("uses muted light text and a dark grid in the cobalt theme", () => {
    expect(chartPalette("cobalt").textColor).toBe("#939aad");
    expect(chartPalette("cobalt").gridColor).toBe("#171e38");
  });

  it("uses muted dark text and a pale grid in the light theme", () => {
    expect(chartPalette("light").textColor).toBe("#666e8b");
    expect(chartPalette("light").gridColor).toBe("#dfe4f2");
  });

  it("fades the cobalt area fill from a stronger top in the cobalt theme", () => {
    expect(chartPalette("cobalt").topColor).toBe("rgba(31, 68, 255, 0.35)");
    expect(chartPalette("cobalt").bottomColor).toBe("rgba(31, 68, 255, 0.02)");
  });

  it("fades the cobalt area fill from a lighter top in the light theme", () => {
    expect(chartPalette("light").topColor).toBe("rgba(31, 68, 255, 0.22)");
    expect(chartPalette("light").bottomColor).toBe("rgba(31, 68, 255, 0.02)");
  });
});
