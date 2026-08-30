import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
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

  it("provides one root command that builds and launches desktop mode", async () => {
    const rootPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const desktopPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const apiPackage = JSON.parse(await readFile(new URL("../../api/package.json", import.meta.url), "utf8")) as {
      exports: { "./server": { types: string } };
    };
    const mainSource = await readFile(new URL("./main.cts", import.meta.url), "utf8");

    expect(rootPackage.scripts["dev:desktop"]).toContain("build:execution");
    expect(rootPackage.scripts["dev:desktop"]).toContain("@dsrd/api");
    expect(rootPackage.scripts["dev:desktop"]).toContain("@dsrd/desktop");
    expect(desktopPackage.scripts.dev).toContain("@dsrd/web");
    expect(desktopPackage.scripts.dev).toContain("ELECTRON_RUN_AS_NODE=");
    expect(desktopPackage.main).toBe("dist/main.cjs");
    expect(desktopPackage.scripts.dev).toContain("electron dist/main.cjs");
    expect(apiPackage.exports["./server"].types).toBe("./src/server.ts");
    expect(mainSource).toContain('require("electron")');
  });
});
