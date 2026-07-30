const BASIC_TOOLTIP = "istnienie i czas potwierdzone on-chain; kwoty zadeklarowane";

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
      <path
        d="M2.5 6.5 5 9l4.5-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VerificationBadge({ state }: { state: string }) {
  if (state === "verified_full") {
    return (
      <span className="verification-badge verification-badge-full">
        <CheckIcon />
        verified
      </span>
    );
  }
  if (state === "verified_basic") {
    return (
      <span className="verification-badge verification-badge-basic" title={BASIC_TOOLTIP}>
        <CheckIcon />
        basic
      </span>
    );
  }
  return null;
}
