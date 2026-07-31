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

  it("defaults to cobalt for garbage values", () => {
    expect(resolveTheme("")).toBe("cobalt");
    expect(resolveTheme("light")).toBe("cobalt");
    expect(resolveTheme("HORIZON")).toBe("cobalt");
    expect(resolveTheme("horizon ")).toBe("cobalt");
  });

  it("accepts cobalt", () => {
    expect(resolveTheme("cobalt")).toBe("cobalt");
  });

  it("accepts horizon", () => {
    expect(resolveTheme("horizon")).toBe("horizon");
  });
});

describe("toggleTheme", () => {
  it("flips cobalt to horizon", () => {
    expect(toggleTheme("cobalt")).toBe("horizon");
  });

  it("flips horizon to cobalt", () => {
    expect(toggleTheme("horizon")).toBe("cobalt");
  });
});

describe("persistTheme", () => {
  it("writes the theme under the storage key", () => {
    const written = new Map<string, string>();
    persistTheme({ setItem: (key, value) => written.set(key, value) }, "horizon");
    expect(written.get("agentscan-theme")).toBe("horizon");
  });
});
