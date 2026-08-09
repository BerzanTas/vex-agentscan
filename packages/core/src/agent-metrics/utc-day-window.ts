const DAY_SECONDS = 86_400;

export const TRAILING_WINDOW_DAYS = 30;

export function utcDayOf(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function trailingWindowStartSeconds(nowSeconds: number): number {
  const startOfToday = Math.floor(nowSeconds / DAY_SECONDS) * DAY_SECONDS;
  return startOfToday - DAY_SECONDS * (TRAILING_WINDOW_DAYS - 1);
}

export function trailingWindowDays(nowSeconds: number): string[] {
  const firstStart = trailingWindowStartSeconds(nowSeconds);
  return Array.from({ length: TRAILING_WINDOW_DAYS }, (_unused, offset) =>
    utcDayOf(firstStart + offset * DAY_SECONDS),
  );
}
