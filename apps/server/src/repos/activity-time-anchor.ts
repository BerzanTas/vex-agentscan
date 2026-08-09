export function activitySettledAtSql(alias: string): string {
  return `COALESCE(${alias}.client_confirmed_at, ${alias}.block_time)`;
}

export function activityTimeAnchorSql(alias: string): string {
  return `COALESCE(${activitySettledAtSql(alias)}, ${alias}.verified_at)`;
}

export function activityAggregateDaySql(alias: string): string {
  return `(${activityTimeAnchorSql(alias)} AT TIME ZONE 'utc')::date`;
}

export function activityPriceHourSql(alias: string): string {
  return `date_trunc('hour', ${activityTimeAnchorSql(alias)} AT TIME ZONE 'utc') AT TIME ZONE 'utc'`;
}
