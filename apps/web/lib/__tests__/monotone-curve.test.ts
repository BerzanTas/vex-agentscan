import { describe, expect, it } from "vitest";
import { monotoneCurveSegments, type CurvePoint, type CurveSegment } from "../monotone-curve";

function pointsEvery3(values: number[]): CurvePoint[] {
  return values.map((y, index) => ({ x: index * 3, y }));
}

function controlPointsOutsideEnvelope(segments: CurveSegment[]): CurvePoint[] {
  return segments.flatMap((segment) => {
    const lowest = Math.min(segment.from.y, segment.to.y);
    const highest = Math.max(segment.from.y, segment.to.y);
    return [segment.control1, segment.control2].filter(
      (control) => control.y < lowest || control.y > highest,
    );
  });
}

describe("monotoneCurveSegments", () => {
  it("returns no segments for empty input", () => {
    expect(monotoneCurveSegments([])).toEqual([]);
  });

  it("returns no segments for a single point", () => {
    expect(monotoneCurveSegments([{ x: 0, y: 5 }])).toEqual([]);
  });

  it("joins two points with a straight chord", () => {
    const segments = monotoneCurveSegments(pointsEvery3([0, 30]));

    expect(segments).toEqual([
      {
        from: { x: 0, y: 0 },
        control1: { x: 1, y: 10 },
        control2: { x: 2, y: 20 },
        to: { x: 3, y: 30 },
      },
    ]);
  });

  it("passes through every data point unchanged", () => {
    const points = pointsEvery3([0, 0, 12045, 0, 0]);

    const segments = monotoneCurveSegments(points);

    expect(segments.map((segment) => segment.from)).toEqual(points.slice(0, -1));
    expect(segments.map((segment) => segment.to)).toEqual(points.slice(1));
  });

  it("keeps every control point inside the data envelope for a spike between zero runs", () => {
    const segments = monotoneCurveSegments(pointsEvery3([0, 0, 12045, 0, 0]));

    expect(controlPointsOutsideEnvelope(segments)).toEqual([]);
  });

  it("renders a run of equal values perfectly flat", () => {
    const segments = monotoneCurveSegments(pointsEvery3([7, 7, 7]));

    const heights = segments.flatMap((segment) => [
      segment.from.y,
      segment.control1.y,
      segment.control2.y,
      segment.to.y,
    ]);
    expect(heights).toEqual([7, 7, 7, 7, 7, 7, 7, 7]);
  });

  it("clamps steep tangents so a monotone ramp never overshoots", () => {
    const segments = monotoneCurveSegments(pointsEvery3([0, 3, 300, 303]));

    expect(controlPointsOutsideEnvelope(segments)).toEqual([]);
  });
});
