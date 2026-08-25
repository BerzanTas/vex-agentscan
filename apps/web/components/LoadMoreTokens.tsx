"use client";

import { useState } from "react";
import {
  fetchTokensFromBrowser,
  type ChartRange,
  type TokenListingDto,
  type TokenStatDto,
} from "../lib/api";
import { TokensTable } from "./TokensTable";

export type AccumulatedTokens = { rows: TokenStatDto[]; nextCursor: string | null };

export function appendTokensPage(
  accumulated: AccumulatedTokens,
  page: TokenListingDto,
): AccumulatedTokens {
  return { rows: [...accumulated.rows, ...page.items], nextCursor: page.nextCursor };
}

export function LoadMoreTokens({
  initialItems,
  initialCursor,
  range,
}: {
  initialItems: TokenStatDto[];
  initialCursor: string | null;
  range: ChartRange;
}) {
  const [accumulated, setAccumulated] = useState<AccumulatedTokens>({
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
      const page = await fetchTokensFromBrowser(range, { cursor });
      setAccumulated((current) => appendTokensPage(current, page));
    } catch (error) {
      console.error(error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <TokensTable rows={accumulated.rows} emptyMessage="No token activity in this window" />
      {loadFailed && (
        <p role="status" className="text-center text-sm text-warning">
          Could not load more tokens
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
