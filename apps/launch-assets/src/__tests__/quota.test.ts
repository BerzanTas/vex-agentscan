/**
 * THE PER-INSTALL BOUND. Both axes are exercised at their boundary, because
 * an off-by-one here either refuses a legitimate launch image or leaves the
 * host one upload past the limit an operator provisioned for.
 */

import { describe, expect, it } from "vitest";
import { decideQuota } from "../quota.js";

const limits = { maxAssets: 3, maxBytes: 1000 };
const usage = (assetCount: number, byteTotal: number) => ({ assetCount, byteTotal });

describe("decideQuota", () => {
  it("admits an upload that lands exactly on both limits", () => {
    expect(decideQuota(usage(2, 900), limits, 100)).toEqual({ ok: true });
  });

  it("refuses the upload that would be one asset past the count limit, naming the axis", () => {
    expect(decideQuota(usage(3, 0), limits, 1)).toEqual({
      ok: false,
      code: "quota_exceeded_count",
      limit: 3,
      used: 3,
    });
  });

  it("refuses the upload that would be one byte past the byte limit, naming the axis", () => {
    expect(decideQuota(usage(1, 900), limits, 101)).toEqual({
      ok: false,
      code: "quota_exceeded_bytes",
      limit: 1000,
      used: 900,
    });
  });

  it("reports the count axis first when both are full, so the message names one cause", () => {
    expect(decideQuota(usage(3, 1000), limits, 1)).toMatchObject({
      code: "quota_exceeded_count",
    });
  });

  it("admits the very first upload of an install with no history", () => {
    expect(decideQuota(usage(0, 0), limits, 1000)).toEqual({ ok: true });
  });
});
