import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "../styles/theme.css";

export const metadata: Metadata = {
  title: "AgentScan",
  description: "Public explorer of Vex agent activity",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-primary font-sans text-text-primary antialiased">
        <header className="border-b border-bg-overlay bg-bg-elevated/50">
          <div className="mx-auto flex max-w-6xl items-baseline gap-4 px-6 py-4">
            <Link href="/" className="font-serif text-3xl tracking-tight">
              AgentScan
            </Link>
            <span className="text-sm text-text-muted">Vex agent activity explorer</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-text-muted">
          All USD values are estimates.
        </footer>
      </body>
    </html>
  );
}
