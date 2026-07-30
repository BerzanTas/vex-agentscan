import type { TxDetailDto } from "../lib/api";

type TimelineSource = Pick<
  TxDetailDto,
  "clientCreatedAt" | "clientConfirmedAt" | "status" | "verificationState"
>;

type Tone = "success" | "warning" | "danger" | "muted";

type TimelineStep = { label: string; at: string | null; tone: Tone };

const toneTextClass: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-text-muted",
};

const toneDotClass: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-text-muted",
};

function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function statusStep(source: TimelineSource): TimelineStep {
  if (source.status === "confirmed") {
    return { label: "Confirmed by agent", at: source.clientConfirmedAt, tone: "success" };
  }
  if (source.status === "definitively_failed") {
    return { label: "Definitively failed", at: null, tone: "danger" };
  }
  return { label: "Pending", at: null, tone: "warning" };
}

function verificationStep(source: TimelineSource): TimelineStep {
  if (source.verificationState === "verified_full") {
    return { label: "Verified on-chain (full)", at: null, tone: "success" };
  }
  if (source.verificationState === "verified_basic") {
    return { label: "Verified on-chain (basic)", at: null, tone: "success" };
  }
  if (source.verificationState === "queued") {
    return { label: "Verification queued", at: null, tone: "warning" };
  }
  return { label: "Not verified", at: null, tone: "muted" };
}

function stepsFrom(source: TimelineSource): TimelineStep[] {
  return [
    { label: "Created by agent", at: source.clientCreatedAt, tone: "success" },
    statusStep(source),
    verificationStep(source),
  ];
}

export function StatusTimeline({ source }: { source: TimelineSource }) {
  return (
    <ol className="flex flex-col gap-4 rounded-lg border border-bg-overlay bg-bg-elevated p-4">
      {stepsFrom(source).map((step) => (
        <li key={step.label} className="flex items-baseline gap-3">
          <span className={`h-2 w-2 shrink-0 self-center rounded-full ${toneDotClass[step.tone]}`} />
          <span className={`text-sm ${toneTextClass[step.tone]}`}>{step.label}</span>
          {step.at !== null && (
            <span className="font-mono text-xs text-text-muted">{formatUtc(step.at)}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
