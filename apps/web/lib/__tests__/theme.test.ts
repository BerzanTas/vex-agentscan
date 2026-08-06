import { describe, expect, it } from "vitest";
import { persistTheme, resolveTheme, THEME_STORAGE_KEY, toggleTheme } from "../theme";

describe("THEME_STORAGE_KEY", () => {
  it("is exactly agentscan-theme", () => {
    expect(THEME_STORAGE_KEY).toBe("agentscan-theme");
  });
});

describe("resolveTheme", () => {
  it("defaults to cobalt when nothing is stored", () => {
    expect(resolveTheme(null)).toBe("cobalt");
  });

  it("migrates the retired horizon theme to cobalt", () => {
    expect(resolveTheme("horizon")).toBe("cobalt");
  });

  it("defaults to cobalt for an empty value", () => {
    expect(resolveTheme("")).toBe("cobalt");
  });

  it("defaults to cobalt for a differently cased value", () => {
    expect(resolveTheme("LIGHT")).toBe("cobalt");
  });

  it("defaults to cobalt for a padded value", () => {
    expect(resolveTheme("light ")).toBe("cobalt");
  });

  it("accepts cobalt", () => {
    expect(resolveTheme("cobalt")).toBe("cobalt");
  });

  it("accepts light", () => {
    expect(resolveTheme("light")).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("flips cobalt to light", () => {
    expect(toggleTheme("cobalt")).toBe("light");
  });

  it("flips light to cobalt", () => {
    expect(toggleTheme("light")).toBe("cobalt");
  });
});

describe("persistTheme", () => {
  it("writes the theme under the storage key", () => {
    const written = new Map<string, string>();

    persistTheme({ setItem: (key, value) => written.set(key, value) }, "light");

    expect(written.get("agentscan-theme")).toBe("light");
  });
});
