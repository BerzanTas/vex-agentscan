import Link from "next/link";
import { MobileNav } from "./MobileNav";
import { NavLink } from "./NavLink";
import { NavMenu } from "./NavMenu";
import { ThemeToggle } from "./ThemeToggle";
import { TopBarSearch } from "./TopBarSearch";

export function TopBar() {
  return (
    <header className="topbar sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <Link href="/" aria-label="AgentScan" className="topbar-logo inline-flex shrink-0 items-center">
          <img src="/logo-dark.svg" alt="AgentScan" className="logo-cobalt h-8 w-auto sm:h-11" />
          <img src="/logo-light.svg" alt="AgentScan" className="logo-light h-8 w-auto sm:h-11" />
        </Link>
        <nav className="hidden shrink-0 items-center gap-6 lg:flex">
          <NavLink href="/activity">Activity</NavLink>
          <NavLink href="/tokens">Tokens</NavLink>
          <NavLink href="/networks">Networks</NavLink>
          <NavMenu />
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-6">
          <TopBarSearch />
          <span className="live-chip hidden shrink-0 items-center gap-2 font-mono text-xs tracking-widest text-text-secondary sm:flex">
            <span className="live-dot" aria-hidden="true" />
            LIVE
          </span>
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
