import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { TopBarSearch } from "./TopBarSearch";

export function TopBar() {
  return (
    <header className="topbar sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" aria-label="AgentScan" className="inline-flex shrink-0 items-center">
          <img src="/logo-dark.svg" alt="AgentScan" className="logo-cobalt h-11 w-auto" />
          <img src="/logo-light.svg" alt="AgentScan" className="logo-light h-11 w-auto" />
        </Link>
        <nav className="flex shrink-0 items-center gap-6">
          <Link href="/activity" className="topbar-nav-link">
            Activity
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-6">
          <TopBarSearch />
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs tracking-widest text-text-secondary">
            <span className="live-dot" aria-hidden="true" />
            LIVE
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
