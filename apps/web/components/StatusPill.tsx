const STATUS_PILL_CLASS: Record<string, string> = {
  confirmed: "status-pill status-pill-confirmed",
  pending: "status-pill status-pill-pending",
  definitively_failed: "status-pill status-pill-failed",
  superseded_unproven: "status-pill status-pill-unproven",
};

const STATUS_LABEL: Record<string, string> = {
  definitively_failed: "failed",
  superseded_unproven: "inclusion unproven",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={STATUS_PILL_CLASS[status] ?? "status-pill"}>
      <span className="status-pill-dot" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
