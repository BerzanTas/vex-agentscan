"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { isCurrentSection } from "./NavLink";

const PANEL_ID = "nav-menu-rankings";

const RANKING_ROUTES = [
  { href: "/agents", label: "Agents" },
  { href: "/protocols", label: "Protocols" },
  { href: "/verification", label: "Verification" },
];

const FOCUS_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

export function nextNavMenuIndex(key: string, focused: number, count: number): number {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowUp") return focused <= 0 ? count - 1 : focused - 1;
  return focused >= count - 1 ? 0 : focused + 1;
}

function CaretIcon() {
  return (
    <svg
      className="nav-menu-caret"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4 5 6.5 7.5 4" />
    </svg>
  );
}

export function NavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const focusOnOpen = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const index = focusOnOpen.current;
    focusOnOpen.current = null;
    if (index === null) return;
    itemRefs.current[index]?.focus();
  }, [open]);

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

  const focusedItemIndex = () =>
    itemRefs.current.findIndex((item) => item !== null && item === document.activeElement);

  const respondToKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!FOCUS_KEYS.includes(event.key)) return;
    event.preventDefault();
    const wanted = nextNavMenuIndex(event.key, focusedItemIndex(), RANKING_ROUTES.length);
    if (!open) {
      focusOnOpen.current = wanted;
      setOpen(true);
      return;
    }
    itemRefs.current[wanted]?.focus();
  };

  const inRankings = RANKING_ROUTES.some((route) => isCurrentSection(pathname, route.href));

  return (
    <div ref={containerRef} className="nav-menu" onKeyDown={respondToKeyboard}>
      <button
        ref={triggerRef}
        type="button"
        className={inRankings ? "nav-menu-trigger topbar-nav-link-active" : "nav-menu-trigger"}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-current={inRankings ? "true" : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Rankings
        <CaretIcon />
      </button>
      <div id={PANEL_ID} className="nav-menu-panel" hidden={!open}>
        {RANKING_ROUTES.map((route, index) => (
          <Link
            key={route.href}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            href={route.href}
            className="nav-menu-item"
            aria-current={pathname === route.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {route.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
