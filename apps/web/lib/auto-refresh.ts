export type RefreshScheduler = {
  isVisible: () => boolean;
  onVisibilityChange: (listener: () => void) => () => void;
  every: (ms: number, listener: () => void) => () => void;
};

export const REFRESH_INTERVAL_MS = 10_000;

export function startAutoRefresh(refresh: () => void, scheduler: RefreshScheduler): () => void {
  const refreshWhenVisible = () => {
    if (!scheduler.isVisible()) return;
    refresh();
  };
  const stopInterval = scheduler.every(REFRESH_INTERVAL_MS, refreshWhenVisible);
  const stopVisibility = scheduler.onVisibilityChange(refreshWhenVisible);
  return () => {
    stopInterval();
    stopVisibility();
  };
}
