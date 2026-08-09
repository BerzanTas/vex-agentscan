const SHARE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const TRUNCATION_SENTENCE = "Figures cover the most recent activities only.";

function unpricedSentence(unpricedSharePct: number): string {
  return `${SHARE_FORMAT.format(unpricedSharePct)}% of this agent's verified activity could not be priced and is excluded from USD figures.`;
}

export function AgentPageDisclosure({
  unpricedSharePct,
  truncated,
}: {
  unpricedSharePct: number;
  truncated: boolean;
}) {
  return (
    <p className="section-enter max-w-3xl text-xs text-text-muted">
      {unpricedSentence(unpricedSharePct)}
      {truncated && ` ${TRUNCATION_SENTENCE}`}
    </p>
  );
}
