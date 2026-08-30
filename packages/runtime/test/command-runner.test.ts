import { describe, expect, it } from "vitest";

import { NodeCommandRunner } from "../src/index.js";

describe("NodeCommandRunner", () => {
  it("terminates a running command when its abort signal fires", async () => {
    const controller = new AbortController();
    const runner = new NodeCommandRunner();
    const run = runner.run({
      command: process.execPath,
      args: ["-e", "setTimeout(() => undefined, 1000)"],
      cwd: process.cwd(),
    }, controller.signal);

    controller.abort(new Error("timed out"));

    await expect(run).rejects.toThrow("timed out");
  });
});
