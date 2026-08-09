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

function activityPhrase(count: number): string {
  return count === 1 ? "1 activity is" : `${count} activities are`;
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
  if (reasons.length === 0) return "Every verified activity in this window is priced.";
  return `${activityPhrase(excludedActivityCount(coverage))} left out of every USD figure (${reasons.join(", ")}), and still counted in transaction counts.`;
}

export function PricingCoverageNote({ coverage }: { coverage: PricingCoverageDto }) {
  if (measuredActivityCount(coverage) === 0) {
    return <p className={NOTE_CLASS}>No verified activity in this window yet.</p>;
  }

  if (finishedPricingCount(coverage) === 0) {
    return (
      <p className={NOTE_CLASS}>
        None of the {coverage.pendingActivityCount} verified activities in this window has been
        priced yet, so no USD figure covers them; they are still counted in transaction counts.
      </p>
    );
  }

  return (
    <p className={NOTE_CLASS}>
      USD figures are priced by AgentScan and cover {coveragePercent(coverage.pricedCoverage)} of the
      verified activity we have finished pricing in this window. {exclusionSentence(coverage)}
    </p>
  );
}
