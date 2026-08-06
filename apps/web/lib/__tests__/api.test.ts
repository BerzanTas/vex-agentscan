import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activityPath,
  chartPath,
  DEFAULT_CHART_RANGE,
  fetchStats,
  fetchTxDetail,
} from "../api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(implementation: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(implementation));
}

describe("fetchStats", () => {
  it("rzuca, gdy API jest nieosiągalne, zamiast zwracać zera", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchStats()).rejects.toThrow();
  });

  it("rzuca, gdy API odpowiada błędem", async () => {
    stubFetch(async () => new Response("nope", { status: 503 }));
    await expect(fetchStats()).rejects.toThrow();
  });
});

describe("fetchTxDetail", () => {
  it("zwraca null wyłącznie dla statusu 404", async () => {
    stubFetch(async () => new Response("", { status: 404 }));
    await expect(fetchTxDetail("pub-1")).resolves.toBeNull();
  });

  it("rzuca, gdy API jest nieosiągalne, zamiast udawać brak transakcji", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchTxDetail("pub-1")).rejects.toThrow();
  });
});

describe("chartPath", () => {
  it("builds a relative path carrying the range", () => {
    expect(chartPath("24h")).toBe("/api/chart?range=24h");
  });

  it("builds the path for the all-time range", () => {
    expect(chartPath("all")).toBe("/api/chart?range=all");
  });
});

describe("DEFAULT_CHART_RANGE", () => {
  it("is 30d so the first paint matches today's behaviour", () => {
    expect(DEFAULT_CHART_RANGE).toBe("30d");
  });
});

describe("activityPath", () => {
  it("builds the first page path without a cursor", () => {
    expect(activityPath()).toBe("/api/activity");
  });

  it("encodes the cursor into the next page path", () => {
    expect(activityPath("2026-08-06T10:00:00.000Z|42")).toBe(
      "/api/activity?cursor=2026-08-06T10%3A00%3A00.000Z%7C42",
    );
  });
});
