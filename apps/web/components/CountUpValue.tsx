"use client";

import { useEffect, useRef } from "react";
import { formatUsdEstimate } from "../lib/format";

const COUNT_UP_MS = 600;

export type CountUpKind = "usd" | "count";

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function intermediateTextOf(kind: CountUpKind, value: number): string {
  if (kind === "usd") return `$${formatUsdEstimate(value.toFixed(2))}`;
  return Math.round(value).toLocaleString("en-US");
}

export function CountUpValue({
  target,
  finalText,
  kind,
}: {
  target: number;
  finalText: string;
  kind: CountUpKind;
}) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const playedRef = useRef(false);

  useEffect(() => {
    const node = nodeRef.current;
    if (node === null || playedRef.current) return;
    playedRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      if (progress >= 1) {
        node.textContent = finalText;
        return;
      }
      node.textContent = intermediateTextOf(kind, target * easeOutCubic(progress));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, finalText, kind]);

  return <span ref={nodeRef}>{finalText}</span>;
}
