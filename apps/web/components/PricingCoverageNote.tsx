import type { PricingCoverageDto } from "../lib/api";

const NOTE_CLASS = "max-w-3xl text-xs text-text-muted";

function coveragePercent(pricedCoverage: number): string {
  return `${(pricedCoverage * 100).toFixed(1)}%`;
}

function measuredActivityCount(coverage: PricingCoverageDto): number {
  return (
    coverage.pricedActivityCount + coverage.unpricedActivityCount + coverage.pendingActivityCount
  );
}

function finishedPricingCount(coverage: PricingCoverageDto): number {
  return coverage.pricedActivityCount + coverage.unpricedActivityCount;
}

function excludedActivityCount(coverage: PricingCoverageDto): number {
  return coverage.unpricedActivityCount + coverage.pendingActivityCount;
}

function legCount(count: number): string {
  return count === 1 ? "1 swap or bridge deposit" : `${count} swaps and bridge deposits`;
}

function legPhrase(count: number): string {
  return `${legCount(count)} ${count === 1 ? "is" : "are"}`;
}

function exclusionReasons(coverage: PricingCoverageDto): string[] {
  const reasons: string[] = [];
  if (coverage.unpricedActivityCount > 0) {
    reasons.push(`${coverage.unpricedActivityCount} we could not price`);
  }
  if (coverage.pendingActivityCount > 0) {
    reasons.push(`${coverage.pendingActivityCount} still being priced`);
  }
  return reasons;
}

function exclusionSentence(coverage: PricingCoverageDto): string {
  const reasons = exclusionReasons(coverage);
  if (reasons.length === 0) return "Every swap and bridge deposit in this window is priced.";
  return `${legPhrase(excludedActivityCount(coverage))} left out of every USD figure (${reasons.join(", ")}), and still counted in transaction counts.`;
}

function nothingPricedSentence(coverage: PricingCoverageDto): string {
  return `Nothing in this window is priced yet: ${legCount(coverage.pendingActivityCount)} still being priced, and still counted in transaction counts.`;
}

export function PricingCoverageNote({ coverage }: { coverage: PricingCoverageDto }) {
  if (measuredActivityCount(coverage) === 0) {
    return (
      <p className={NOTE_CLASS}>
        USD figures are priced by AgentScan from the swaps and bridge deposits it holds. It holds none
        for this window, so there is no coverage to report here.
      </p>
    );
  }

  if (finishedPricingCount(coverage) === 0) {
    return <p className={NOTE_CLASS}>{nothingPricedSentence(coverage)}</p>;
  }

  return (
    <p className={NOTE_CLASS}>
      USD figures are priced by AgentScan and cover {coveragePercent(coverage.pricedCoverage)} of the
      swaps and bridge deposits in this window we have finished pricing. {exclusionSentence(coverage)}
    </p>
  );
}
