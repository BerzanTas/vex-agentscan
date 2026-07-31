"use client";

import { persistTheme, resolveTheme, toggleTheme } from "../lib/theme";

export function ThemeToggle() {
  const switchTheme = () => {
    const next = toggleTheme(resolveTheme(document.documentElement.dataset.theme ?? null));
    document.documentElement.dataset.theme = next;
    persistTheme(window.localStorage, next);
  };

  return (
    <button type="button" aria-label="Switch theme" className="theme-toggle" onClick={switchTheme}>
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
        <path d="M4.5 10a3.5 3.5 0 0 1 7 0" />
        <line x1="1.5" y1="12.5" x2="14.5" y2="12.5" />
        <line x1="8" y1="2.5" x2="8" y2="4" />
        <line x1="3.4" y1="4.9" x2="4.45" y2="5.95" />
        <line x1="12.6" y1="4.9" x2="11.55" y2="5.95" />
      </svg>
    </button>
  );
}
