export const THEME_STORAGE_KEY = "agentscan-theme";

export type Theme = "cobalt" | "light";

export function resolveTheme(stored: string | null): Theme {
  return stored === "light" ? "light" : "cobalt";
}

export function toggleTheme(theme: Theme): Theme {
  return theme === "cobalt" ? "light" : "cobalt";
}

export function persistTheme(storage: Pick<Storage, "setItem">, theme: Theme): void {
  storage.setItem(THEME_STORAGE_KEY, theme);
}
