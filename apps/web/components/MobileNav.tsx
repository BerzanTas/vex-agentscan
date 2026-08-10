"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { isCurrentSection } from "./NavLink";
import { nextNavMenuIndex } from "./NavMenu";

const PANEL_ID = "mobile-nav-routes";

const MOBILE_NAV_ROUTES = [
  { href: "/", label: "Overview" },
  { href: "/activity", label: "Activity" },
  { href: "/tokens", label: "Tokens" },
  { href: "/networks", label: "Networks" },
  { href: "/agents", label: "Top agents" },
  { href: "/protocols", label: "Protocols" },
  { href: "/verification", label: "Verification" },
];

const FOCUS_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

function BarsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  );
}

export function MobileNav() {
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
    const wanted = nextNavMenuIndex(event.key, focusedItemIndex(), MOBILE_NAV_ROUTES.length);
    if (!open) {
      focusOnOpen.current = wanted;
      setOpen(true);
      return;
    }
    itemRefs.current[wanted]?.focus();
  };

  return (
    <div ref={containerRef} className="mobile-nav lg:hidden" onKeyDown={respondToKeyboard}>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-nav-trigger"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <BarsIcon />
        Menu
      </button>
      <nav id={PANEL_ID} className="mobile-nav-panel" aria-label="Site" hidden={!open}>
        {MOBILE_NAV_ROUTES.map((route, index) => (
          <Link
            key={route.href}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            href={route.href}
            className={
              isCurrentSection(pathname, route.href)
                ? "mobile-nav-item mobile-nav-item-current"
                : "mobile-nav-item"
            }
            aria-current={pathname === route.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
