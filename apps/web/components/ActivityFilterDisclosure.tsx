"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const PANEL_ID = "activity-filter-console";

function triggerLabel(activeFilterCount: number): string {
  if (activeFilterCount === 0) return "Filters";
  return `Filters (${activeFilterCount} active)`;
}

export function ActivityFilterDisclosure({
  activeFilterCount,
  children,
}: {
  activeFilterCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(activeFilterCount > 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="filter-console-shell" onKeyDown={closeOnEscape}>
      <button
        ref={triggerRef}
        type="button"
        className="filter-disclosure-trigger"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {triggerLabel(activeFilterCount)}
      </button>
      <div
        id={PANEL_ID}
        className="glass filter-console"
        role="group"
        aria-label="Activity filters"
        data-collapsed={open ? undefined : "true"}
      >
        {children}
      </div>
    </div>
  );
}
