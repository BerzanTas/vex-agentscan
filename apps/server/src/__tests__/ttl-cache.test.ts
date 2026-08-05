import { describe, expect, it } from "vitest";
import { TtlCache } from "../plugins/ttl-cache.js";

function countingLoader(value: string) {
  const state = { calls: 0 };
  return {
    state,
    load: async () => {
      state.calls += 1;
      return value;
    },
  };
}

describe("TtlCache", () => {
  it("woła loader raz na klucz w obrębie TTL", async () => {
    let nowMs = 1_000_000;
    const cache = new TtlCache<string>(5, () => nowMs);
    const { state, load } = countingLoader("a");

    expect(await cache.get("stats", load)).toBe("a");
    nowMs += 4_999;
    expect(await cache.get("stats", load)).toBe("a");
    expect(state.calls).toBe(1);
  });

  it("woła loader ponownie po upływie TTL", async () => {
    let nowMs = 1_000_000;
    const cache = new TtlCache<string>(5, () => nowMs);
    const { state, load } = countingLoader("a");

    await cache.get("stats", load);
    nowMs += 5_001;
    await cache.get("stats", load);
    expect(state.calls).toBe(2);
  });

  it("trzyma osobne wpisy dla osobnych kluczy", async () => {
    const cache = new TtlCache<string>(5, () => 1_000_000);
    const first = countingLoader("a");
    const second = countingLoader("b");

    expect(await cache.get("chart:7", first.load)).toBe("a");
    expect(await cache.get("chart:30", second.load)).toBe("b");
    expect(first.state.calls).toBe(1);
    expect(second.state.calls).toBe(1);
  });

  it("scala równoczesne żądania tego samego klucza w jedno wywołanie loadera", async () => {
    const cache = new TtlCache<string>(5, () => 1_000_000);
    const { state, load } = countingLoader("a");

    const [first, second] = await Promise.all([cache.get("stats", load), cache.get("stats", load)]);
    expect(first).toBe("a");
    expect(second).toBe("a");
    expect(state.calls).toBe(1);
  });

  it("nie zapamiętuje nieudanego wywołania loadera", async () => {
    const cache = new TtlCache<string>(5, () => 1_000_000);
    let calls = 0;
    const failingThenOk = async () => {
      calls += 1;
      if (calls === 1) throw new Error("read failed");
      return "a";
    };

    await expect(cache.get("stats", failingThenOk)).rejects.toThrow("read failed");
    expect(await cache.get("stats", failingThenOk)).toBe("a");
    expect(calls).toBe(2);
  });
});
