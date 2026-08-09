import type { ChartPointDto, StatsDto } from "../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { cumulativeSeriesEndingAt, txValues, volumeValues } from "../lib/stat-series";
import { CountUpValue, type CountUpKind } from "./CountUpValue";
import { CursorLight } from "./CursorLight";
import { StatSparkline } from "./StatSparkline";

const TREND_WINDOW = "30D";
const AGENT_WINDOW = "7D";

type StatFooter = { trend: number[] } | { window: string };

type StatCell = {
  label: string;
  target: number;
  finalText: string;
  exactText: string;
  countUp: CountUpKind;
  footer: StatFooter;
};

function usdCell(label: string, usdPriced: string, trend: number[]): StatCell {
  return {
    label,
    target: Number(usdPriced),
    finalText: `$${formatUsdCompact(usdPriced)}`,
    exactText: `$${formatUsdEstimate(usdPriced)}`,
    countUp: "usdCompact",
    footer: { trend },
  };
}

function countCell(label: string, count: number, footer: StatFooter): StatCell {
  return {
    label,
    target: count,
    finalText: count.toLocaleString("en-US"),
    exactText: count.toLocaleString("en-US"),
    countUp: "count",
    footer,
  };
}

function cellsFrom(stats: StatsDto, series: ChartPointDto[]): StatCell[] {
  const volume = volumeValues(series);
  const tx = txValues(series);
  return [
    usdCell("Daily volume", stats.dailyVolumeUsd, volume),
    usdCell(
      "Total volume",
      stats.totalVolumeUsd,
      cumulativeSeriesEndingAt(volume, Number(stats.totalVolumeUsd)),
    ),
    countCell("Daily txns", stats.dailyTx, { trend: tx }),
    countCell("Total txns", stats.totalTx, {
      trend: cumulativeSeriesEndingAt(tx, stats.totalTx),
    }),
    countCell("Active agents", stats.activeAgents7d, { window: AGENT_WINDOW }),
  ];
}

function StatCellFooter({ label, footer }: { label: string; footer: StatFooter }) {
  if ("window" in footer) {
    return (
      <div className="stat-cell-footer">
        <span className="live-dot" />
        <span className="stat-cell-window">{footer.window} window</span>
      </div>
    );
  }
  return (
    <div className="stat-cell-footer">
      <StatSparkline values={footer.trend} label={`${label} over ${TREND_WINDOW}`} />
      <span className="stat-cell-window">{TREND_WINDOW}</span>
    </div>
  );
}

export function StatCards({ stats, series }: { stats: StatsDto; series: ChartPointDto[] }) {
  return (
    <section className="section-enter">
      <CursorLight className="stat-console">
        <div className="stat-console-grid">
          {cellsFrom(stats, series).map((cell) => (
            <div key={cell.label} className="stat-cell">
              <span className="stat-cell-label">{cell.label}</span>
              <p className="stat-cell-value" title={cell.exactText}>
                <CountUpValue
                  target={cell.target}
                  finalText={cell.finalText}
                  kind={cell.countUp}
                />
              </p>
              <StatCellFooter label={cell.label} footer={cell.footer} />
            </div>
          ))}
        </div>
      </CursorLight>
    </section>
  );
}
