export type CurvePoint = { x: number; y: number };

export type CurveSegment = {
  from: CurvePoint;
  control1: CurvePoint;
  control2: CurvePoint;
  to: CurvePoint;
};

type Interval = { from: CurvePoint; to: CurvePoint; slope: number };

function intervalsBetween(points: readonly CurvePoint[]): Interval[] {
  const intervals: Interval[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    intervals.push({ from, to, slope: (to.y - from.y) / (to.x - from.x) });
  }
  return intervals;
}

function initialTangents(intervals: readonly Interval[]): number[] {
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  if (first === undefined || last === undefined) return [];
  const tangents = [first.slope];
  for (let index = 1; index < intervals.length; index += 1) {
    const before = intervals[index - 1];
    const after = intervals[index];
    if (before === undefined || after === undefined) continue;
    const monotone = before.slope * after.slope > 0;
    tangents.push(monotone ? (before.slope + after.slope) / 2 : 0);
  }
  tangents.push(last.slope);
  return tangents;
}

function clampTangentsToMonotone(intervals: readonly Interval[], tangents: number[]): number[] {
  const clamped = [...tangents];
  for (let index = 0; index < intervals.length; index += 1) {
    const slope = intervals[index]?.slope;
    const entering = clamped[index];
    const leaving = clamped[index + 1];
    if (slope === undefined || entering === undefined || leaving === undefined) continue;
    if (slope === 0) {
      clamped[index] = 0;
      clamped[index + 1] = 0;
      continue;
    }
    const alpha = entering / slope;
    const beta = leaving / slope;
    const radius = Math.hypot(alpha, beta);
    if (radius <= 3) continue;
    clamped[index] = (3 * alpha * slope) / radius;
    clamped[index + 1] = (3 * beta * slope) / radius;
  }
  return clamped;
}

export function monotoneCurveSegments(points: readonly CurvePoint[]): CurveSegment[] {
  const intervals = intervalsBetween(points);
  const tangents = clampTangentsToMonotone(intervals, initialTangents(intervals));
  const segments: CurveSegment[] = [];
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    const entering = tangents[index];
    const leaving = tangents[index + 1];
    if (interval === undefined || entering === undefined || leaving === undefined) continue;
    const third = (interval.to.x - interval.from.x) / 3;
    segments.push({
      from: interval.from,
      control1: { x: interval.from.x + third, y: interval.from.y + entering * third },
      control2: { x: interval.to.x - third, y: interval.to.y - leaving * third },
      to: interval.to,
    });
  }
  return segments;
}
