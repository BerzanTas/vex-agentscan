import type { PricingCoverageDto } from "../lib/api";

function coveragePercent(pricedCoverage: number): string {
  return `${(pricedCoverage * 100).toFixed(1)}%`;
}

function excludedActivityCount(coverage: PricingCoverageDto): number {
  return coverage.unpricedActivityCount + coverage.pendingActivityCount;
}

export function PricingCoverageNote({ coverage }: { coverage: PricingCoverageDto }) {
  return (
    <p className="max-w-3xl text-xs text-text-muted">
      USD figures are priced by AgentScan and cover {coveragePercent(coverage.pricedCoverage)} of the
      verified activity in this window. {excludedActivityCount(coverage)} activities are left out of
      every USD figure ({coverage.unpricedActivityCount} we could not price,{" "}
      {coverage.pendingActivityCount} not priced yet); they are still counted in transaction counts.
    </p>
  );
}
