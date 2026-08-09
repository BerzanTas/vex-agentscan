const SHARE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const TRUNCATION_SENTENCE = "Figures cover the most recent activities only.";

const PRICED_ONLY_FIGURES_SENTENCE =
  "Those transactions are excluded from the realized result, the win rate and the breakdown volumes, but are still counted in the transaction counts.";

const MEASURED_POPULATION = "this agent's swaps and bridge deposits we have finished pricing";

function readSetSentence(unpricedSharePct: number): string {
  return `Of ${MEASURED_POPULATION}, ${SHARE_FORMAT.format(unpricedSharePct)}% could not be priced. ${PRICED_ONLY_FIGURES_SENTENCE}`;
}

function trailing30dSentence(unpriced30dSharePct: number): string {
  return `Over the trailing 30 days that share is ${SHARE_FORMAT.format(unpriced30dSharePct)}%, excluded from the capital deployed figure and the daily chart.`;
}

export function AgentPageDisclosure({
  unpricedSharePct,
  unpriced30dSharePct,
  truncated,
}: {
  unpricedSharePct: number;
  unpriced30dSharePct: number;
  truncated: boolean;
}) {
  return (
    <p className="section-enter max-w-3xl text-xs text-text-muted">
      {readSetSentence(unpricedSharePct)}
      {` ${trailing30dSentence(unpriced30dSharePct)}`}
      {truncated && ` ${TRUNCATION_SENTENCE}`}
    </p>
  );
}
