import type { Metadata } from "next";
import { ActivityFilters } from "../../components/ActivityFilters";
import { LoadMoreActivity } from "../../components/LoadMoreActivity";
import { PageHeading } from "../../components/PageHeading";
import {
  activeActivityFilterCount,
  activityFiltersToQuery,
  chainFilterOptions,
  parseActivityFilters,
  protocolFilterOptions,
  type ActivitySearchParams,
} from "../../lib/activity-filters";
import { fetchActivity, fetchNetworks, fetchProtocols } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activity - AgentScan",
  description: "Every verified Vex agent activity, newest first",
};

function activeFilterLabel(count: number): string {
  return count === 1 ? "1 filter active" : `${count} filters active`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<ActivitySearchParams>;
}) {
  const filters = parseActivityFilters(await searchParams);
  const activeCount = activeActivityFilterCount(filters);
  const [feed, protocols, networks] = await Promise.all([
    fetchActivity(filters),
    fetchProtocols(),
    fetchNetworks(),
  ]);

  return (
    <section className="section-enter flex flex-col gap-6">
      <PageHeading
        kicker="LIVE FEED // ACTIVITY"
        title="Activity"
        actions={
          activeCount > 0 ? (
            <span className="text-xs text-text-muted">{activeFilterLabel(activeCount)}</span>
          ) : undefined
        }
      />
      <ActivityFilters
        filters={filters}
        protocols={protocolFilterOptions(protocols, filters.protocol)}
        chains={chainFilterOptions(networks, filters.chain)}
      />
      <LoadMoreActivity
        key={activityFiltersToQuery(filters).toString()}
        initialItems={feed.items}
        initialCursor={feed.nextCursor}
        filters={filters}
      />
    </section>
  );
}
