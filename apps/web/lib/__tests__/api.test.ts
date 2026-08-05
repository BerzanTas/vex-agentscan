import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStats, fetchTxDetail } from "../api.js";

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
