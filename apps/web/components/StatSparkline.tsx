import { sparklineAreaPath, sparklinePath } from "../lib/sparkline";

const SPARK_WIDTH = 120;
const SPARK_HEIGHT = 28;

export function StatSparkline({ values, label }: { values: number[]; label: string }) {
  return (
    <svg
      className="stat-spark"
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
    >
      <title>{label}</title>
      <path className="stat-spark-area" d={sparklineAreaPath(values, SPARK_WIDTH, SPARK_HEIGHT)} />
      <path className="stat-spark-line" d={sparklinePath(values, SPARK_WIDTH, SPARK_HEIGHT)} />
    </svg>
  );
}
