const COORDINATE_PRECISION = 2;

type ScaledPoint = { x: number; y: number };

export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return horizontalPath(width, height);
  if (values.length === 1) return horizontalPath(width, height / 2);

  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  if (highest === lowest) return horizontalPath(width, height / 2);

  return monotoneCurvePath(scaledPoints(values, width, height, lowest, highest));
}

export function sparklineAreaPath(values: number[], width: number, height: number): string {
  const baseline = `L ${coordinate(width)} ${coordinate(height)} L 0 ${coordinate(height)} Z`;
  return `${sparklinePath(values, width, height)} ${baseline}`;
}

function scaledPoints(
  values: number[],
  width: number,
  height: number,
  lowest: number,
  highest: number,
): ScaledPoint[] {
  const spacing = width / (values.length - 1);
  return values.map((value, index) => ({
    x: index * spacing,
    y: height - ((value - lowest) / (highest - lowest)) * height,
  }));
}

function monotoneCurvePath(points: ScaledPoint[]): string {
  const segments = neighborPairs(points);
  const opening = segments[0];
  if (!opening) return "";

  const moveTo = `M ${pathPoint(opening[0])}`;
  if (segments.length === 1) return `${moveTo} L ${pathPoint(opening[1])}`;

  const tangents = fritschCarlsonTangents(points);
  const curves = segments.map(([begin, end], index) =>
    curveCommand(begin, end, tangents[index] ?? 0, tangents[index + 1] ?? 0),
  );
  return `${moveTo} ${curves.join(" ")}`;
}

function curveCommand(
  begin: ScaledPoint,
  end: ScaledPoint,
  beginTangent: number,
  endTangent: number,
): string {
  const offset = (end.x - begin.x) / 3;
  const control1 = { x: begin.x + offset, y: begin.y + beginTangent * offset };
  const control2 = { x: end.x - offset, y: end.y - endTangent * offset };
  return `C ${pathPoint(control1)} ${pathPoint(control2)} ${pathPoint(end)}`;
}

function fritschCarlsonTangents(points: ScaledPoint[]): number[] {
  const secants = neighborPairs(points).map(
    ([begin, end]) => (end.y - begin.y) / (end.x - begin.x),
  );
  const interior = neighborPairs(secants).map(([before, after]) => limitedTangent(before, after));
  const first = endpointTangent(secants.at(0) ?? 0, interior.at(0) ?? 0);
  const last = endpointTangent(secants.at(-1) ?? 0, interior.at(-1) ?? 0);
  return [first, ...interior, last];
}

function limitedTangent(secantBefore: number, secantAfter: number): number {
  const monotoneSign = Math.sign(secantBefore) + Math.sign(secantAfter);
  const centeredSlope = (secantBefore + secantAfter) / 2;
  return (
    monotoneSign *
    Math.min(Math.abs(secantBefore), Math.abs(secantAfter), Math.abs(centeredSlope) / 2)
  );
}

function endpointTangent(edgeSecant: number, adjacentTangent: number): number {
  return (3 * edgeSecant - adjacentTangent) / 2;
}

function neighborPairs<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (const [index, item] of items.entries()) {
    const previous = items[index - 1];
    if (previous !== undefined) pairs.push([previous, item]);
  }
  return pairs;
}

function horizontalPath(width: number, y: number): string {
  return `M 0 ${coordinate(y)} L ${coordinate(width)} ${coordinate(y)}`;
}

function pathPoint(point: ScaledPoint): string {
  return `${coordinate(point.x)} ${coordinate(point.y)}`;
}

function coordinate(value: number): string {
  return Number(value.toFixed(COORDINATE_PRECISION)).toString();
}
