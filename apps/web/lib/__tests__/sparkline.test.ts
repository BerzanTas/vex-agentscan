import { describe, expect, it } from "vitest";
import { sparklineAreaPath, sparklinePath } from "../sparkline";

const WIDTH = 96;
const HEIGHT = 24;

function pathCoordinates(path: string): { x: number; y: number }[] {
  const numbers = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pairs: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    pairs.push({ x: numbers[index] as number, y: numbers[index + 1] as number });
  }
  return pairs;
}

describe("sparklinePath", () => {
  it("draws a flat line along the bottom for an empty series", () => {
    expect(sparklinePath([], WIDTH, HEIGHT)).toBe("M 0 24 L 96 24");
  });

  it("draws a dash at mid height for a single value", () => {
    expect(sparklinePath([1234.5], WIDTH, HEIGHT)).toBe("M 0 12 L 96 12");
  });

  it("draws a flat line at mid height when every value is equal", () => {
    expect(sparklinePath([7, 7, 7, 7], WIDTH, HEIGHT)).toBe("M 0 12 L 96 12");
  });

  it("spreads the points evenly from the left edge to the right edge", () => {
    expect(sparklinePath([0, 1, 2], WIDTH, HEIGHT)).toBe("M 0 24 L 48 12 L 96 0");
  });

  it("puts the last point of a rising series above the first", () => {
    const points = pathCoordinates(sparklinePath([1, 4, 9, 25], WIDTH, HEIGHT));

    expect(points[points.length - 1]?.y).toBeLessThan(points[0]?.y as number);
  });

  it("puts the last point of a falling series below the first", () => {
    const points = pathCoordinates(sparklinePath([25, 9, 4, 1], WIDTH, HEIGHT));

    expect(points[points.length - 1]?.y).toBeGreaterThan(points[0]?.y as number);
  });

  it("keeps every coordinate inside the box for a wide value range", () => {
    const points = pathCoordinates(sparklinePath([0.000001, 987654321, 12, 5000, 0], WIDTH, HEIGHT));

    expect(points).toHaveLength(5);
    expect(points.every((point) => point.x >= 0 && point.x <= WIDTH)).toBe(true);
    expect(points.every((point) => point.y >= 0 && point.y <= HEIGHT)).toBe(true);
  });

  it("scales the points into the given box", () => {
    expect(sparklinePath([0, 10], 10, 100)).toBe("M 0 100 L 10 0");
  });
});

describe("sparklineAreaPath", () => {
  it("closes the line down to the baseline", () => {
    expect(sparklineAreaPath([0, 10], WIDTH, HEIGHT)).toBe("M 0 24 L 96 0 L 96 24 L 0 24 Z");
  });

  it("closes an empty series along the baseline", () => {
    expect(sparklineAreaPath([], WIDTH, HEIGHT)).toBe("M 0 24 L 96 24 L 96 24 L 0 24 Z");
  });
});
