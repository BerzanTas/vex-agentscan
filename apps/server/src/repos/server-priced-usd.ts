const SERVER_PRICED = "server_priced";

export function serverPricedUsdIn(alias: string): string {
  return `(CASE WHEN ${alias}.pricing_state = '${SERVER_PRICED}' THEN ${alias}.usd_in_priced END)`;
}

export function serverPricedUsdOut(alias: string): string {
  return `(CASE WHEN ${alias}.pricing_state = '${SERVER_PRICED}' THEN ${alias}.usd_out_priced END)`;
}

export function serverPricedUsdInSum(alias: string): string {
  return `COALESCE(SUM(${serverPricedUsdIn(alias)}), 0)`;
}

export function serverPricedUsdInSumOf(alias: string, rowPredicate: string): string {
  return `COALESCE(SUM(${serverPricedUsdIn(alias)}) FILTER (WHERE ${rowPredicate}), 0)`;
}

export function contributesUsd(alias: string): string {
  return `(${alias}.pricing_state = '${SERVER_PRICED}' AND ${alias}.usd_in_priced IS NOT NULL)`;
}

export function contributesNoUsd(alias: string): string {
  const pricedWithoutValue = `${alias}.pricing_state = '${SERVER_PRICED}' AND ${alias}.usd_in_priced IS NULL`;
  return `(${alias}.pricing_state = 'unpriced' OR (${pricedWithoutValue}))`;
}

export function awaitingAPrice(alias: string): string {
  return `${alias}.pricing_state = 'pending'`;
}
