import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CLIENT_ESTIMATE_COLUMN = /usd_(in|out)_est/;

const PER_ROW_DETAIL_LINES: Record<string, readonly string[]> = {
  "read-repo.ts": [
    "usd_in_est: string | null;",
    "usd_out_est: string | null;",
    "a.usd_in_est, a.usd_out_est, a.usd_fee_est, a.usd_source,",
    "usd_in_est: raw.usd_in_est,",
    "usd_out_est: raw.usd_out_est,",
  ],
  "network-repo.ts": [],
  "token-repo.ts": [],
  "route-repo.ts": [],
};

function estimateReferencesIn(fileName: string): string[] {
  const path = fileURLToPath(new URL(`../repos/${fileName}`, import.meta.url));
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => CLIENT_ESTIMATE_COLUMN.test(line));
}

describe("public aggregate repositories", () => {
  for (const [fileName, perRowDetailLines] of Object.entries(PER_ROW_DETAIL_LINES)) {
    it(`sums no client usd estimate in ${fileName}`, () => {
      const references = estimateReferencesIn(fileName);

      expect(references.filter((line) => !perRowDetailLines.includes(line))).toEqual([]);
    });

    it(`keeps every exempted per-row detail line of ${fileName} present`, () => {
      const references = estimateReferencesIn(fileName);

      expect(perRowDetailLines.filter((line) => !references.includes(line))).toEqual([]);
    });
  }
});
