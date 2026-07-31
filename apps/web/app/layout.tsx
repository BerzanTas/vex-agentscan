import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TopBar } from "../components/TopBar";
import "../styles/theme.css";

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

const themeInitScript = `try{var stored=localStorage.getItem("agentscan-theme");if(stored==="cobalt"||stored==="horizon")document.documentElement.dataset.theme=stored}catch(ignored){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-bg-primary font-sans text-text-primary antialiased">
        <TopBar />
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-text-muted">
          All USD values are estimates.
        </footer>
      </body>
    </html>
  );
}
