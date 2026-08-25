"use client";

import { useState } from "react";
import {
  fetchAgentsFromBrowser,
  type AgentLeaderboardDto,
  type AgentStatDto,
  type ChartRange,
} from "../lib/api";
import { AgentsRankingTable } from "./AgentsRankingTable";

export type AccumulatedAgents = { rows: AgentStatDto[]; nextCursor: string | null };

export function appendAgentsPage(
  accumulated: AccumulatedAgents,
  page: AgentLeaderboardDto,
): AccumulatedAgents {
  return { rows: [...accumulated.rows, ...page.items], nextCursor: page.nextCursor };
}

export function LoadMoreAgents({
  initialItems,
  initialCursor,
  range,
}: {
  initialItems: AgentStatDto[];
  initialCursor: string | null;
  range: ChartRange;
}) {
  const [accumulated, setAccumulated] = useState<AccumulatedAgents>({
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
      const page = await fetchAgentsFromBrowser(range, { cursor });
      setAccumulated((current) => appendAgentsPage(current, page));
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AgentsRankingTable agents={accumulated.rows} emptyMessage="No verified agent activity yet" />
      {loadFailed && (
        <p role="status" className="text-center text-sm text-warning">
          Could not load more agents
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
