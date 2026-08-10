export type IngestEventStatus =
  | "pending"
  | "confirmed"
  | "definitively_failed"
  | "superseded_unproven";

export type ExistingActivityState = {
  status: IngestEventStatus;
  statusesSeen: IngestEventStatus[];
};

export type IngestOutcome = "insert" | "duplicate" | "promote" | "accept_noop";

export type IngestDecision = { outcome: IngestOutcome };

const TERMINAL_STATUSES: readonly IngestEventStatus[] = [
  "confirmed",
  "definitively_failed",
  "superseded_unproven",
];

export function isTerminalIngestStatus(status: IngestEventStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isFailedIngestStatus(status: IngestEventStatus): boolean {
  return status === "definitively_failed";
}

export function decideIngest(
  existing: ExistingActivityState | null,
  incoming: IngestEventStatus,
): IngestDecision {
  if (existing === null) return { outcome: "insert" };
  if (existing.statusesSeen.includes(incoming)) return { outcome: "duplicate" };
  if (existing.status === "pending" && TERMINAL_STATUSES.includes(incoming)) {
    return { outcome: "promote" };
  }
  return { outcome: "accept_noop" };
}
