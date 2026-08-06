"use client";

import { useEffect, useRef } from "react";
import {
  COUNT_UP_MS,
  COUNT_UP_THRESHOLD,
  countUpText,
  easeOutCubic,
  type CountUpKind,
} from "../lib/count-up";

export type { CountUpKind };

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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      playedRef.current = true;
      return;
    }
    let frame = 0;
    const countUp = () => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
        if (progress >= 1) {
          node.textContent = finalText;
          return;
        }
        node.textContent = countUpText(kind, target * easeOutCubic(progress));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        playedRef.current = true;
        countUp();
      },
      { threshold: COUNT_UP_THRESHOLD },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target, finalText, kind]);

  return <span ref={nodeRef}>{finalText}</span>;
}
