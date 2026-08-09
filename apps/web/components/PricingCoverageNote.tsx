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

function excludedActivityCount(coverage: PricingCoverageDto): number {
  return coverage.unpricedActivityCount + coverage.pendingActivityCount;
}

function excludedPhrase(excluded: number): string {
  return excluded === 1 ? "1 activity is" : `${excluded} activities are`;
}

export function PricingCoverageNote({ coverage }: { coverage: PricingCoverageDto }) {
  if (measuredActivityCount(coverage) === 0) {
    return <p className={NOTE_CLASS}>No verified activity in this window yet.</p>;
  }

  return (
    <p className={NOTE_CLASS}>
      USD figures are priced by AgentScan and cover {coveragePercent(coverage.pricedCoverage)} of the
      verified activity in this window. {excludedPhrase(excludedActivityCount(coverage))} left out of
      every USD figure ({coverage.unpricedActivityCount} we could not price,{" "}
      {coverage.pendingActivityCount} not priced yet); they are still counted in transaction counts.
    </p>
  );
}
