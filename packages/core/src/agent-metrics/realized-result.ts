import { chronological, isServerPriced, type AgentActivity, type AgentActivityLeg } from "./agent-activity.js";
import {
  ZERO_DECIMAL,
  addDecimal,
  decimalFromRawAmount,
  decimalFromText,
  decimalToText,
  isPositiveDecimal,
  proportionOfDecimal,
  smallerDecimal,
  subtractDecimal,
  type Decimal,
} from "./decimal.js";

export type RealizedResult = {
  realizedUsd: string;
  closedRoundTrips: number;
  winningRoundTrips: number;
  unmatchedDisposals: number;
};

type PricedLeg = { inventoryKey: string; quantity: Decimal; usd: Decimal };

type SwapTrade = { disposal: PricedLeg; acquisition: PricedLeg };

type InventoryLot = { quantity: Decimal; cost: Decimal };

type Consumption = { matchedCost: Decimal; matchedQuantity: Decimal; consumedLots: number };

function inventoryKeyOf(activity: AgentActivity, tokenAddress: string): string {
  return `${activity.chainFamily}:${activity.chainId}:${tokenAddress.toLowerCase()}`;
}

function pricedLegOf(activity: AgentActivity, leg: AgentActivityLeg): PricedLeg | null {
  if (leg.tokenAddress === null || leg.tokenDecimals === null) return null;
  if (leg.executedRaw === null || leg.usdPriced === null) return null;
  return {
    inventoryKey: inventoryKeyOf(activity, leg.tokenAddress),
    quantity: decimalFromRawAmount(leg.executedRaw, leg.tokenDecimals),
    usd: decimalFromText(leg.usdPriced),
  };
}

function swapTradeOf(activity: AgentActivity): SwapTrade | null {
  if (activity.kind !== "swap" || !isServerPriced(activity)) return null;
  const disposal = pricedLegOf(activity, activity.spent);
  const acquisition = pricedLegOf(activity, activity.received);
  if (disposal === null || acquisition === null) return null;
  return { disposal, acquisition };
}

function consumeInventory(lots: InventoryLot[], quantity: Decimal): Consumption {
  let remaining = quantity;
  let matchedCost = ZERO_DECIMAL;
  let matchedQuantity = ZERO_DECIMAL;
  let consumedLots = 0;
  while (isPositiveDecimal(remaining)) {
    const oldest = lots[0];
    if (oldest === undefined) break;
    const taken = smallerDecimal(oldest.quantity, remaining);
    const cost =
      taken === oldest.quantity
        ? oldest.cost
        : proportionOfDecimal(oldest.cost, taken, oldest.quantity);
    matchedCost = addDecimal(matchedCost, cost);
    matchedQuantity = addDecimal(matchedQuantity, taken);
    remaining = subtractDecimal(remaining, taken);
    consumedLots += 1;
    if (taken === oldest.quantity) {
      lots.shift();
      continue;
    }
    oldest.quantity = subtractDecimal(oldest.quantity, taken);
    oldest.cost = subtractDecimal(oldest.cost, cost);
  }
  return { matchedCost, matchedQuantity, consumedLots };
}

function lotsFor(inventory: Map<string, InventoryLot[]>, inventoryKey: string): InventoryLot[] {
  const existing = inventory.get(inventoryKey);
  if (existing !== undefined) return existing;
  const created: InventoryLot[] = [];
  inventory.set(inventoryKey, created);
  return created;
}

export function realizedResult(activities: readonly AgentActivity[]): RealizedResult {
  const inventory = new Map<string, InventoryLot[]>();
  let realized = ZERO_DECIMAL;
  let closedRoundTrips = 0;
  let winningRoundTrips = 0;
  let unmatchedDisposals = 0;

  for (const activity of chronological(activities)) {
    const trade = swapTradeOf(activity);
    if (trade === null) continue;
    const consumption = consumeInventory(
      lotsFor(inventory, trade.disposal.inventoryKey),
      trade.disposal.quantity,
    );
    if (consumption.matchedQuantity < trade.disposal.quantity) unmatchedDisposals += 1;
    if (consumption.consumedLots > 0) {
      const matchedProceeds = proportionOfDecimal(
        trade.disposal.usd,
        consumption.matchedQuantity,
        trade.disposal.quantity,
      );
      const result = subtractDecimal(matchedProceeds, consumption.matchedCost);
      realized = addDecimal(realized, result);
      closedRoundTrips += 1;
      if (isPositiveDecimal(result)) winningRoundTrips += 1;
    }
    if (!isPositiveDecimal(trade.acquisition.quantity)) continue;
    lotsFor(inventory, trade.acquisition.inventoryKey).push({
      quantity: trade.acquisition.quantity,
      cost: trade.acquisition.usd,
    });
  }

  return {
    realizedUsd: decimalToText(realized),
    closedRoundTrips,
    winningRoundTrips,
    unmatchedDisposals,
  };
}

export function winRate(result: RealizedResult, minimumRoundTrips: number): number | null {
  if (result.closedRoundTrips < minimumRoundTrips) return null;
  if (result.closedRoundTrips === 0) return null;
  return result.winningRoundTrips / result.closedRoundTrips;
}
