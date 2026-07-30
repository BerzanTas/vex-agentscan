import Link from "next/link";

export function TopBar() {
  return (
    <header className="topbar sticky top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" aria-label="AgentScan" className="inline-flex items-center">
          <img src="/logo.png" alt="AgentScan" className="h-11 w-auto" />
        </Link>
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 font-mono text-xs tracking-widest text-text-secondary">
            <span className="live-dot" aria-hidden="true" />
            LIVE
          </span>
          <Link href="/methodology" className="text-sm text-text-secondary hover:text-text-primary">
            Methodology
          </Link>
        </div>
      </div>
    </header>
  );
}
