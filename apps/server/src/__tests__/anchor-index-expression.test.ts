import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activityTimeAnchorSql } from "../repos/activity-time-anchor.js";

const ANCHOR_INDEX_MIGRATION = "../../../../db/migrations/0012_activities_anchor_index.sql";

function migrationSql(): string {
  return readFileSync(fileURLToPath(new URL(ANCHOR_INDEX_MIGRATION, import.meta.url)), "utf8");
}

function unqualifiedAnchorExpression(): string {
  return activityTimeAnchorSql("activities").replaceAll("activities.", "");
}

describe("the anchor index", () => {
  it("indexes the expression the aggregate reads anchor on", () => {
    expect(migrationSql()).toContain(`ON activities ((${unqualifiedAnchorExpression()}))`);
  });

  it("covers the verified rows the aggregate reads select", () => {
    expect(migrationSql()).toContain(
      "WHERE verification_state IN ('verified_full', 'verified_basic')",
    );
  });
});
