const PUBLISHABLE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/;

export function publishableLabel(raw: string | null, fallback: string): string {
  if (raw === null) return fallback;
  if (!PUBLISHABLE_LABEL.test(raw)) return fallback;
  return raw;
}
