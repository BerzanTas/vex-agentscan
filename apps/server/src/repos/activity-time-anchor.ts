export const ACTIVITY_TIME_ANCHOR_SQL = "COALESCE(client_confirmed_at, block_time, verified_at)";

export const ACTIVITY_AGGREGATE_DAY_SQL = `(${ACTIVITY_TIME_ANCHOR_SQL} AT TIME ZONE 'utc')::date`;

export const ACTIVITY_PRICE_HOUR_SQL =
  `date_trunc('hour', ${ACTIVITY_TIME_ANCHOR_SQL} AT TIME ZONE 'utc') AT TIME ZONE 'utc'`;
