"use client";

import { useEffect, useState } from "react";
import { persistTheme, resolveTheme, toggleTheme, type Theme } from "../lib/theme";

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.5" />
      <line x1="8" y1="1" x2="8" y2="2.6" />
      <line x1="8" y1="13.4" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.6" y2="8" />
      <line x1="13.4" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.18" y2="4.18" />
      <line x1="11.82" y1="11.82" x2="12.95" y2="12.95" />
      <line x1="12.95" y1="3.05" x2="11.82" y2="4.18" />
      <line x1="4.18" y1="11.82" x2="3.05" y2="12.95" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("cobalt");

  useEffect(() => {
    setTheme(resolveTheme(document.documentElement.dataset.theme ?? null));
  }, []);

  const switchTheme = () => {
    const next = toggleTheme(theme);
    document.documentElement.dataset.theme = next;
    persistTheme(window.localStorage, next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      aria-label={theme === "cobalt" ? "Switch to light theme" : "Switch to dark theme"}
      className="theme-toggle"
      onClick={switchTheme}
    >
      {theme === "cobalt" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
