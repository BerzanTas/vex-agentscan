"use client";

import { useState } from "react";
import {
  fetchActivityFromBrowser,
  type ActivityFeedDto,
  type ActivityFilters,
  type ActivityRowDto,
} from "../lib/api";
import { ActivityTable } from "./ActivityTable";

export type AccumulatedActivity = { rows: ActivityRowDto[]; nextCursor: string | null };

export function appendActivityPage(
  accumulated: AccumulatedActivity,
  page: ActivityFeedDto,
): AccumulatedActivity {
  return { rows: [...accumulated.rows, ...page.items], nextCursor: page.nextCursor };
}

export function LoadMoreActivity({
  initialItems,
  initialCursor,
  filters = {},
}: {
  initialItems: ActivityRowDto[];
  initialCursor: string | null;
  filters?: ActivityFilters;
}) {
  const [accumulated, setAccumulated] = useState<AccumulatedActivity>({
    rows: initialItems,
    nextCursor: initialCursor,
  });
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadNextPage = async () => {
    const cursor = accumulated.nextCursor;
    if (cursor === null || loading) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const page = await fetchActivityFromBrowser(cursor, filters);
      setAccumulated((current) => appendActivityPage(current, page));
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ActivityTable rows={accumulated.rows} emptyMessage="Waiting for the first verified activity" />
      {loadFailed && (
        <p role="status" className="text-center text-sm text-warning">
          Could not load more activity
        </p>
      )}
      {accumulated.nextCursor !== null && (
        <div className="flex justify-center">
          <button type="button" className="load-more" onClick={loadNextPage} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
