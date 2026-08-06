"use client";

import { usePathname } from "next/navigation";
import { SearchBar } from "./SearchBar";

const DASHBOARD_PATH = "/";

export function TopBarSearch() {
  const pathname = usePathname();
  if (pathname === DASHBOARD_PATH) return null;

  return (
    <div className="hidden w-64 md:block">
      <SearchBar />
    </div>
  );
}
