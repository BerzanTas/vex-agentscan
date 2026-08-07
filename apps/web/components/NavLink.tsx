"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ROOT_PATH = "/";

export function isCurrentSection(pathname: string, href: string): boolean {
  if (href === ROOT_PATH) return pathname === ROOT_PATH;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const inSection = isCurrentSection(pathname, href);

  return (
    <Link
      href={href}
      className={inSection ? "topbar-nav-link topbar-nav-link-active" : "topbar-nav-link"}
      aria-current={pathname === href ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
