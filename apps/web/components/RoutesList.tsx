import type { BridgeRouteDto } from "../lib/api";
import { formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { ChainBadge } from "./ChainBadge";

const ROUTE_ARROW = "→";

function routeKey(route: BridgeRouteDto): string {
  return `${route.fromChainSlug}-${route.toChainSlug}`;
}

function legLabel(legCount: number): string {
  const legs = legCount.toLocaleString("en-US");
  return legCount === 1 ? `${legs} leg` : `${legs} legs`;
}

export function RoutesList({
  routes,
  emptyMessage,
}: {
  routes: BridgeRouteDto[];
  emptyMessage: string;
}) {
  if (routes.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col">
      {routes.map((route) => (
        <li key={routeKey(route)} className="route-row">
          <ChainBadge slug={route.fromChainSlug} />
          <span className="route-arrow" aria-hidden="true">
            {ROUTE_ARROW}
          </span>
          <ChainBadge slug={route.toChainSlug} />
          <span className="ml-auto text-xs text-text-muted">{legLabel(route.legCount)}</span>
          <span className="text-text-primary" title={`$${formatUsdEstimate(route.volumeUsd)}`}>
            ${formatUsdCompact(route.volumeUsd)}
          </span>
        </li>
      ))}
    </ul>
  );
}
