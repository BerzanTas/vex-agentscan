import type { TxDetailDto } from "../lib/api";

type TimelineSource = Pick<
  TxDetailDto,
  "clientCreatedAt" | "clientConfirmedAt" | "status" | "verificationState"
>;

type Tone = "success" | "warning" | "danger" | "muted";

type TimelineStep = { label: string; at: string | null; tone: Tone; reached: boolean };

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
    return { label: "Confirmed by agent", at: source.clientConfirmedAt, tone: "success", reached: true };
  }
  if (source.status === "definitively_failed") {
    return { label: "Definitively failed", at: null, tone: "danger", reached: true };
  }
  return { label: "Pending", at: null, tone: "warning", reached: false };
}

function verificationStep(source: TimelineSource): TimelineStep {
  if (source.verificationState === "verified_full") {
    return { label: "Verified on-chain (full)", at: null, tone: "success", reached: true };
  }
  if (source.verificationState === "verified_basic") {
    return { label: "Verified on-chain (basic)", at: null, tone: "success", reached: true };
  }
  if (source.verificationState === "queued") {
    return { label: "Verification queued", at: null, tone: "warning", reached: false };
  }
  return { label: "Not verified", at: null, tone: "muted", reached: false };
}

function stepsFrom(source: TimelineSource): TimelineStep[] {
  return [
    { label: "Created by agent", at: source.clientCreatedAt, tone: "success", reached: true },
    statusStep(source),
    verificationStep(source),
  ];
}

export function StatusTimeline({ source }: { source: TimelineSource }) {
  const steps = stepsFrom(source);
  return (
    <ol className="glass flex flex-col p-4">
      {steps.map((step, index) => (
        <li key={step.label} className="timeline-step relative flex gap-3 pb-5 last:pb-0">
          {index < steps.length - 1 && <span className="timeline-line" aria-hidden="true" />}
          <span
            className={`timeline-dot ${toneDotClass[step.tone]} ${
              step.reached ? "timeline-dot-reached" : ""
            }`}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-0.5">
            <span className={`text-sm ${toneTextClass[step.tone]}`}>{step.label}</span>
            {step.at !== null && (
              <span className="font-mono text-xs text-text-muted">{formatUtc(step.at)}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
