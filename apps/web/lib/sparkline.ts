const COORDINATE_PRECISION = 2;

export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return horizontalPath(width, height);
  if (values.length === 1) return horizontalPath(width, height / 2);

  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  if (highest === lowest) return horizontalPath(width, height / 2);

  const spacing = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * spacing;
    const y = height - ((value - lowest) / (highest - lowest)) * height;
    return `${coordinate(x)} ${coordinate(y)}`;
  });
  return `M ${points.join(" L ")}`;
}

export function sparklineAreaPath(values: number[], width: number, height: number): string {
  const baseline = `L ${coordinate(width)} ${coordinate(height)} L 0 ${coordinate(height)} Z`;
  return `${sparklinePath(values, width, height)} ${baseline}`;
}

function horizontalPath(width: number, y: number): string {
  return `M 0 ${coordinate(y)} L ${coordinate(width)} ${coordinate(y)}`;
}

function coordinate(value: number): string {
  return Number(value.toFixed(COORDINATE_PRECISION)).toString();
}
