import { legCount } from "../lib/pricing-legs";

const SHARE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const TRUNCATION_SENTENCE = "Figures cover the most recent activities only.";

const PRICED_ONLY_FIGURES_SENTENCE =
  "Those transactions are not fully reflected in the realized result, the win rate or the breakdown volumes, and are still counted in the transaction counts.";

const MEASURED_POPULATION = "this agent's swaps and bridge deposits we have finished pricing";

function readSetSentence(unpricedSharePct: number): string {
  return `Of ${MEASURED_POPULATION}, ${SHARE_FORMAT.format(unpricedSharePct)}% could not be fully priced. ${PRICED_ONLY_FIGURES_SENTENCE}`;
}

function trailing30dSentence(unpriced30dSharePct: number): string {
  return `Over the trailing 30 days that share is ${SHARE_FORMAT.format(unpriced30dSharePct)}%, not fully reflected in the capital deployed figure or the daily chart.`;
}

function awaitingAPriceSentence(awaitingAPriceCount: number): string {
  return `${legCount(awaitingAPriceCount)} still being priced, and not yet in any USD figure on this page.`;
}

export function AgentPageDisclosure({
  unpricedSharePct,
  unpriced30dSharePct,
  awaitingAPriceCount,
  truncated,
}: {
  unpricedSharePct: number;
  unpriced30dSharePct: number;
  awaitingAPriceCount: number;
  truncated: boolean;
}) {
  return (
    <p className="section-enter max-w-3xl text-xs text-text-muted">
      {readSetSentence(unpricedSharePct)}
      {` ${trailing30dSentence(unpriced30dSharePct)}`}
      {awaitingAPriceCount > 0 && ` ${awaitingAPriceSentence(awaitingAPriceCount)}`}
      {truncated && ` ${TRUNCATION_SENTENCE}`}
    </p>
  );
}
