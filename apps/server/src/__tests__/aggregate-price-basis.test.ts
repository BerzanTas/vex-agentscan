import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER_SRC = new URL("../", import.meta.url);

const CLIENT_ESTIMATE_COLUMN = /usd_(in|out)_est/;
const SERVER_PRICED_COLUMN = /usd_(in|out)_priced/;
const CLIENT_ESTIMATE_DAILY_SUM = /sum\(\s*(?:\w+\.)?volume_usd\s*\)/is;
const PRICING_STATE_GUARD = /pricing_state/;

const PRICED_COLUMN_OWNER = "repos/server-priced-usd.ts";

const NON_AGGREGATE_REPOS: readonly string[] = [
  "activities-ingest-repo.ts",
  "activities-verify-repo.ts",
  "agents-repo.ts",
  "handshake-repo.ts",
  "purge-repo.ts",
  "rate-limit-repo.ts",
  "token-attestations-repo.ts",
  "token-attestations-verify-repo.ts",
  "verification-repo.ts",
];

const PER_ROW_DETAIL_LINES: Record<string, readonly string[]> = {
  "repos/read-repo.ts": [
    "usd_in_est: string | null;",
    "usd_out_est: string | null;",
    "a.usd_in_est, a.usd_out_est, a.usd_fee_est, a.usd_source,",
    "usd_in_est: raw.usd_in_est,",
    "usd_out_est: raw.usd_out_est,",
    // The Vex fee leg's own estimate, projected onto the action it charged for and published as
    // `vexFee.usdEst` beside the row's `usdInEst`. Per-row detail: never summed into an aggregate.
    "fee.usd_in_est        AS usd_est,",
  ],
  "public-dto.ts": ["usdInEst: row.usd_in_est,", "usdOutEst: row.usd_out_est,"],
  "repos/activity-pricing-repo.ts": [
    "usd_in_est: string | null;",
    "usd_out_est: string | null;",
    "executed_in_raw, token_in_address, token_in_decimals, usd_in_est,",
    "executed_out_raw, token_out_address, token_out_decimals, usd_out_est`,",
    "usdInEst: row.usd_in_est,",
    "usdOutEst: row.usd_out_est,",
  ],
};

const PER_ROW_PRICED_LINES: Record<string, readonly string[]> = {
  "repos/activity-pricing-repo.ts": [
    "usd_in_priced = $2::numeric,",
    "usd_out_priced = $3::numeric,",
  ],
  "repos/agent-page-repo.ts": [
    "usd_in_priced: string | null;",
    "usd_out_priced: string | null;",
    "a.usd_in_priced::text AS usd_in_priced,",
    "a.usd_out_priced::text AS usd_out_priced,",
    "usdPriced: row.usd_in_priced,",
    "usdPriced: row.usd_out_priced,",
  ],
};

function typeScriptFilesIn(directory: string): string[] {
  return readdirSync(fileURLToPath(new URL(directory, SERVER_SRC)))
    .filter((fileName) => fileName.endsWith(".ts"))
    .sort();
}

function aggregateSources(): string[] {
  const repos = typeScriptFilesIn("repos/")
    .filter((fileName) => !NON_AGGREGATE_REPOS.includes(fileName))
    .map((fileName) => `repos/${fileName}`);
  const dtos = typeScriptFilesIn("./").filter((fileName) => fileName.endsWith("-dto.ts"));
  return [...repos, ...dtos];
}

function sourceOf(sourcePath: string): string {
  return readFileSync(fileURLToPath(new URL(sourcePath, SERVER_SRC)), "utf8");
}

function linesOf(sourcePath: string): string[] {
  return sourceOf(sourcePath)
    .split("\n")
    .map((line) => line.trim());
}

function linesMatching(sourcePath: string, pattern: RegExp): string[] {
  return linesOf(sourcePath).filter((line) => pattern.test(line));
}

function perRowDetailLinesOf(sourcePath: string): readonly string[] {
  return PER_ROW_DETAIL_LINES[sourcePath] ?? [];
}

function perRowPricedLinesOf(sourcePath: string): readonly string[] {
  return PER_ROW_PRICED_LINES[sourcePath] ?? [];
}

const KNOWN_AGGREGATE_SOURCES = [
  "repos/network-repo.ts",
  "repos/read-repo.ts",
  "repos/route-repo.ts",
  "repos/server-priced-usd.ts",
  "repos/token-repo.ts",
  "public-dto.ts",
];

describe("the set of files the price basis is guarded over", () => {
  it("scans every repository that is not named as a non-aggregate one", () => {
    expect(aggregateSources()).toEqual(expect.arrayContaining(KNOWN_AGGREGATE_SOURCES));
  });

  it("names no non-aggregate repository that has been renamed away", () => {
    const present = typeScriptFilesIn("repos/");

    expect(NON_AGGREGATE_REPOS.filter((fileName) => !present.includes(fileName))).toEqual([]);
  });
});

describe("public aggregate sources", () => {
  for (const sourcePath of aggregateSources()) {
    it(`sums no client usd estimate in ${sourcePath}`, () => {
      const references = linesMatching(sourcePath, CLIENT_ESTIMATE_COLUMN);
      const exempted = perRowDetailLinesOf(sourcePath);

      expect(references.filter((line) => !exempted.includes(line))).toEqual([]);
    });

    it(`sums no client estimate column of daily_aggregates in ${sourcePath}`, () => {
      expect(CLIENT_ESTIMATE_DAILY_SUM.test(sourceOf(sourcePath))).toBe(false);
    });

    if (sourcePath === PRICED_COLUMN_OWNER) continue;

    it(`reads the priced columns only through ${PRICED_COLUMN_OWNER} in ${sourcePath}`, () => {
      const references = linesMatching(sourcePath, SERVER_PRICED_COLUMN);
      const exempted = perRowPricedLinesOf(sourcePath);

      expect(references.filter((line) => !exempted.includes(line))).toEqual([]);
    });
  }

  for (const [sourcePath, exempted] of Object.entries(PER_ROW_DETAIL_LINES)) {
    it(`keeps every exempted per-row detail line of ${sourcePath} present`, () => {
      const references = linesMatching(sourcePath, CLIENT_ESTIMATE_COLUMN);

      expect(exempted.filter((line) => !references.includes(line))).toEqual([]);
    });
  }

  for (const [sourcePath, exempted] of Object.entries(PER_ROW_PRICED_LINES)) {
    it(`keeps every exempted per-row priced line of ${sourcePath} present`, () => {
      const references = linesMatching(sourcePath, SERVER_PRICED_COLUMN);

      expect(exempted.filter((line) => !references.includes(line))).toEqual([]);
    });
  }
});

describe(PRICED_COLUMN_OWNER, () => {
  it("guards every priced column read with the pricing state", () => {
    const priced = linesMatching(PRICED_COLUMN_OWNER, SERVER_PRICED_COLUMN);

    expect(priced.filter((line) => !PRICING_STATE_GUARD.test(line))).toEqual([]);
  });

  it("reads both priced columns", () => {
    const priced = linesMatching(PRICED_COLUMN_OWNER, SERVER_PRICED_COLUMN).join("\n");

    expect(priced).toContain("usd_in_priced");
    expect(priced).toContain("usd_out_priced");
  });
});
