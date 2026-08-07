"use client";

import type { MouseEvent, ReactNode } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function followCursor(event: MouseEvent<HTMLDivElement>): void {
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
  const element = event.currentTarget;
  const bounds = element.getBoundingClientRect();
  element.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
  element.style.setProperty("--my", `${event.clientY - bounds.top}px`);
}

export function CursorLight({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`glass cursor-light ${className}`.trim()}
      onMouseEnter={followCursor}
      onMouseMove={followCursor}
    >
      {children}
    </div>
  );
}
