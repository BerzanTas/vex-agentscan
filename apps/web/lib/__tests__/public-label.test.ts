import { describe, expect, it } from "vitest";
import { publishableLabel } from "../public-label.js";

describe("publishableLabel", () => {
  it("publishes a protocol slug unchanged", () => {
    expect(publishableLabel("kyberswap", "unknown protocol")).toBe("kyberswap");
  });

  it("publishes a chain slug carrying a separator", () => {
    expect(publishableLabel("robinhood-chain", "unknown chain")).toBe("robinhood-chain");
  });

  it("falls back for a missing label", () => {
    expect(publishableLabel(null, "unknown chain")).toBe("unknown chain");
  });

  it("falls back for a wallet address, which is never published", () => {
    expect(publishableLabel(`0x${"cd".repeat(20)}`, "unknown protocol")).toBe("unknown protocol");
  });

  it("falls back for a transaction hash, which is never published", () => {
    expect(publishableLabel(`0x${"ab".repeat(32)}`, "unknown protocol")).toBe("unknown protocol");
  });

  it("falls back for an explorer link, which is never published", () => {
    expect(publishableLabel("https://basescan.org/tx/0xabc", "unknown protocol")).toBe(
      "unknown protocol",
    );
  });

  it("falls back for a label carrying markup", () => {
    expect(publishableLabel("<img src=x>", "unknown protocol")).toBe("unknown protocol");
  });

  it("falls back for an empty label", () => {
    expect(publishableLabel("", "unknown protocol")).toBe("unknown protocol");
  });
});
