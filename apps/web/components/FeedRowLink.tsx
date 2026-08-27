import Link from "next/link";
import type { ReactNode } from "react";

export function FeedRowLink({
  href,
  children,
  className,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const primary = ariaLabel !== undefined;
  return (
    <Link
      href={href}
      className={className === undefined ? "feed-row-link" : `feed-row-link ${className}`}
      aria-label={ariaLabel}
      tabIndex={primary ? undefined : -1}
    >
      {children}
    </Link>
  );
}
