import { describe, expect, it } from "vitest";
import { createWindowOptions, isAllowedNavigation } from "./window-policy.js";

describe("desktop window policy", () => {
  it("keeps the renderer isolated from Node", () => {
    const options = createWindowOptions("C:/app/preload.js");

    expect(options.webPreferences).toMatchObject({
      preload: "C:/app/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it("allows only navigation within the renderer origin", () => {
    const renderer = "http://127.0.0.1:5173";

    expect(isAllowedNavigation(`${renderer}/failures`, renderer)).toBe(true);
    expect(isAllowedNavigation("https://example.com", renderer)).toBe(false);
    expect(isAllowedNavigation("not a URL", renderer)).toBe(false);
  });
});
