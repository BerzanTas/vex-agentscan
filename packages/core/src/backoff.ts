const secondMs = 1000;
const minuteMs = 60 * secondMs;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

const intervalPattern = /^(\d+)([smh])$/;

function intervalToMs(interval: string): number {
  const match = intervalPattern.exec(interval);
  const count = match?.[1];
  const unit = match?.[2];
  if (count === undefined || unit === undefined) throw new Error(`invalid backoff interval: ${interval}`);
  const unitMs = unit === "s" ? secondMs : unit === "m" ? minuteMs : hourMs;
  return Number(count) * unitMs;
}

export function nextBackoff(args: {
  attempts: number;
  schedule: string[];
  firstAttemptAt: Date;
  maxAgeDays: number;
  now: Date;
}): { delayMs: number } | { giveUp: true } {
  if (args.now.getTime() - args.firstAttemptAt.getTime() > args.maxAgeDays * dayMs) return { giveUp: true };
  const interval = args.schedule[Math.min(args.attempts, args.schedule.length - 1)];
  if (interval === undefined) throw new Error("backoff schedule is empty");
  return { delayMs: intervalToMs(interval) };
}
