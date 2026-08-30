import { describe, expect, it } from "vitest";
import { getInitialTheme, toggleTheme } from "./theme";

describe("theme selection", () => {
  it("defaults to dark and restores a saved light preference", () => {
    expect(getInitialTheme(null)).toBe("dark");
    expect(getInitialTheme("light")).toBe("light");
  });

  it("toggles between dark and light", () => {
    expect(toggleTheme("dark")).toBe("light");
    expect(toggleTheme("light")).toBe("dark");
  });
});
