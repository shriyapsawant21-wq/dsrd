import { describe, expect, it } from "vitest";
import { createElectronEnvironment } from "./launcher.js";

describe("Electron launcher", () => {
  it("removes ELECTRON_RUN_AS_NODE instead of leaving an empty value", () => {
    const source = {
      ELECTRON_RUN_AS_NODE: "1",
      DSRD_RENDERER_URL: "http://127.0.0.1:5174",
    };

    const environment = createElectronEnvironment(source);

    expect(environment).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
    expect(environment.DSRD_RENDERER_URL).toBe("http://127.0.0.1:5174");
    expect(source.ELECTRON_RUN_AS_NODE).toBe("1");
  });
});
