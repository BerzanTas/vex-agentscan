"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { startAutoRefresh } from "../lib/auto-refresh";

export function AutoRefresh() {
  const router = useRouter();

  useEffect(
    () =>
      startAutoRefresh(() => router.refresh(), {
        isVisible: () => document.visibilityState === "visible",
        onVisibilityChange: (listener) => {
          document.addEventListener("visibilitychange", listener);
          return () => document.removeEventListener("visibilitychange", listener);
        },
        every: (ms, listener) => {
          const timer = setInterval(listener, ms);
          return () => clearInterval(timer);
        },
      }),
    [router],
  );

  return null;
}
