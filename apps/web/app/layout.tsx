import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AmbientBackdrop } from "../components/AmbientBackdrop";
import { SiteFooter } from "../components/SiteFooter";
import { TopBar } from "../components/TopBar";
import "../styles/theme.css";
import "../styles/backdrop.css";
import "../styles/navbar.css";
import "../styles/search.css";
import "../styles/headings.css";
import "../styles/filters.css";

export const metadata: Metadata = {
  title: "AgentScan",
  description: "Public explorer of Vex agent activity",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
  },
};

const themeInitScript = `try{var stored=localStorage.getItem("agentscan-theme");document.documentElement.dataset.theme=stored==="light"?"light":"cobalt"}catch(ignored){document.documentElement.dataset.theme="cobalt"}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-screen flex-col bg-bg-primary font-sans text-text-primary antialiased">
        <AmbientBackdrop />
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
