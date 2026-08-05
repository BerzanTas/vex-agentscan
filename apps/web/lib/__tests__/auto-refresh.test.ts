import { describe, expect, it } from "vitest";
import { startAutoRefresh } from "../auto-refresh.js";

function fakeScheduler(initiallyVisible: boolean) {
  const state = {
    visible: initiallyVisible,
    tick: () => {},
    visibilityListener: () => {},
    intervalCleared: false,
    listenerRemoved: false,
  };
  const scheduler = {
    isVisible: () => state.visible,
    onVisibilityChange: (listener: () => void) => {
      state.visibilityListener = listener;
      return () => {
        state.listenerRemoved = true;
      };
    },
    every: (_ms: number, listener: () => void) => {
      state.tick = listener;
      return () => {
        state.intervalCleared = true;
      };
    },
  };
  return { state, scheduler };
}

describe("startAutoRefresh", () => {
  it("nie odświeża, gdy karta jest niewidoczna", () => {
    const { state, scheduler } = fakeScheduler(false);
    let refreshes = 0;
    startAutoRefresh(() => (refreshes += 1), scheduler);

    state.tick();
    state.tick();

    expect(refreshes).toBe(0);
  });

  it("odświeża przy tyknięciu, gdy karta jest widoczna", () => {
    const { state, scheduler } = fakeScheduler(true);
    let refreshes = 0;
    startAutoRefresh(() => (refreshes += 1), scheduler);

    state.tick();

    expect(refreshes).toBe(1);
  });

  it("odświeża natychmiast po powrocie karty na wierzch", () => {
    const { state, scheduler } = fakeScheduler(false);
    let refreshes = 0;
    startAutoRefresh(() => (refreshes += 1), scheduler);

    state.visible = true;
    state.visibilityListener();

    expect(refreshes).toBe(1);
  });

  it("sprząta interwał i nasłuch przy zatrzymaniu", () => {
    const { state, scheduler } = fakeScheduler(true);
    const stop = startAutoRefresh(() => {}, scheduler);

    stop();

    expect(state.intervalCleared).toBe(true);
    expect(state.listenerRemoved).toBe(true);
  });
});
