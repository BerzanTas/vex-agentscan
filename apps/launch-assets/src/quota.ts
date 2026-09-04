/**
 * THE PER-INSTALL STORAGE BOUND, as pure arithmetic.
 *
 * This host is a public image host with no payment on it, so the only thing
 * standing between it and being someone's free CDN is a bound per install.
 * Both axes are enforced because either can be exhausted alone: a thousand
 * favicons cost inodes and backup time, one 2 MB upload repeated cost bytes.
 *
 * A refusal is named for the axis it hit. "Quota exceeded" alone would leave
 * the desktop app unable to tell the user which knob is full.
 */

export type QuotaLimits = {
  readonly maxAssets: number;
  readonly maxBytes: number;
};

export type QuotaUsage = {
  readonly assetCount: number;
  readonly byteTotal: number;
};

export type QuotaDecision =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "quota_exceeded_count" | "quota_exceeded_bytes";
      readonly limit: number;
      readonly used: number;
    };

/**
 * Decided against the usage of the install's LIVE assets only. A deleted asset
 * frees its quota because its bytes are genuinely gone - the tombstone that
 * keeps its cid unreusable costs a row, not storage.
 */
export function decideQuota(
  usage: QuotaUsage,
  limits: QuotaLimits,
  incomingBytes: number,
): QuotaDecision {
  if (usage.assetCount + 1 > limits.maxAssets) {
    return {
      ok: false,
      code: "quota_exceeded_count",
      limit: limits.maxAssets,
      used: usage.assetCount,
    };
  }
  if (usage.byteTotal + incomingBytes > limits.maxBytes) {
    return {
      ok: false,
      code: "quota_exceeded_bytes",
      limit: limits.maxBytes,
      used: usage.byteTotal,
    };
  }
  return { ok: true };
}
