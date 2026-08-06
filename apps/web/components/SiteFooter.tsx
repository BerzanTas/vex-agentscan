import Link from "next/link";

const TAGLINE =
  "Public explorer of Vex agent activity. Swaps and bridges reported by Vex installations, each checked against the chain it declares.";

const DISCLAIMER =
  "All USD values are estimates supplied at quote time, never settlement prices. Activity is reported by Vex installations and verified on-chain.";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="mx-auto max-w-6xl px-6">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" aria-label="AgentScan" className="inline-flex">
              <img src="/logo-dark.svg" alt="AgentScan" className="logo-cobalt h-9 w-auto" />
              <img src="/logo-light.svg" alt="AgentScan" className="logo-light h-9 w-auto" />
            </Link>
            <p className="footer-tagline">{TAGLINE}</p>
          </div>
          <nav className="footer-col" aria-label="Explore">
            <span className="footer-col-title">Explore</span>
            <Link href="/" className="footer-link">
              Overview
            </Link>
            <Link href="/activity" className="footer-link">
              Activity
            </Link>
          </nav>
          <nav className="footer-col" aria-label="Vex">
            <span className="footer-col-title">Vex</span>
            <a
              href="https://projectvex.ai"
              target="_blank"
              rel="noopener"
              className="footer-link"
            >
              projectvex.ai
            </a>
          </nav>
        </div>
        <div className="footer-bottom">
          <p className="footer-note">{DISCLAIMER}</p>
          <span className="footer-status">© 2026 Vex</span>
        </div>
      </div>
    </footer>
  );
}
