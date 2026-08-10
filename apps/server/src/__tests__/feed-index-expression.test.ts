import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activityEventTimeCursorSql } from "../repos/activity-time-anchor.js";
import { migrateUpSection } from "../testing/pg-harness.js";

const FEED_INDEX_MIGRATION = "../../../../db/migrations/0014_activities_event_time_feed_indexes.sql";

const FEED_INDEX_NAMES = [
  "idx_activities_event_time_feed",
  "idx_activities_protocol_event_time_feed",
  "idx_activities_chain_event_time_feed",
];

function appliedMigrationSql(): string {
  return migrateUpSection(
    readFileSync(fileURLToPath(new URL(FEED_INDEX_MIGRATION, import.meta.url)), "utf8"),
  );
}

function createIndexStatement(indexName: string): string {
  const statements = appliedMigrationSql().split("CREATE INDEX ");
  return statements.find((statement) => statement.startsWith(indexName)) ?? "";
}

function unqualifiedEventTimeCursorExpression(): string {
  return activityEventTimeCursorSql("activities").replaceAll("activities.", "");
}

describe("the event-time feed indexes", () => {
  it.each(FEED_INDEX_NAMES)("indexes in %s the expression the feed orders by", (indexName) => {
    expect(createIndexStatement(indexName)).toContain(
      `(${unqualifiedEventTimeCursorExpression()}) DESC`,
    );
  });

  it("orders by the immutable three-argument date_trunc an index expression demands", () => {
    expect(activityEventTimeCursorSql("a")).toBe(
      "date_trunc('milliseconds', COALESCE(COALESCE(a.client_confirmed_at, a.block_time), a.client_created_at), 'UTC')",
    );
  });
});
