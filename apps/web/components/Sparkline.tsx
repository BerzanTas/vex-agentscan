import { sparklineAreaPath, sparklinePath } from "../lib/sparkline";

const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 24;

export type SparklinePoint = { bucketStart: number; volumeUsd: string; txCount: number };

export function Sparkline({ series, label }: { series: SparklinePoint[]; label: string }) {
  const values = series.map((point) => Number(point.volumeUsd));
  return (
    <svg
      className="sparkline"
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
    >
      <title>{label}</title>
      <path
        className="sparkline-area"
        d={sparklineAreaPath(values, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)}
      />
      <path className="sparkline-line" d={sparklinePath(values, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)} />
    </svg>
  );
}
