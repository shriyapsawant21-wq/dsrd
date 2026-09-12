import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectConfig } from "../src/index.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("loadProjectConfig", () => {
  it("reports field paths for an invalid dependency without running a configured command", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-config-"));
    directories.push(directory);
    const configPath = join(directory, "dsrd.yaml");
    await writeFile(configPath, "version: 1\ntarget:\n  id: process:app\n  adapter: local-process\n  root: .\nworkloads:\n  api:\n    kind: service\n    command: [node, server.js]\n    dependsOn:\n      - workloadId: missing\n        condition: service_healthy\nstate: { policy: fresh-owned }\n");
    await expect(loadProjectConfig(configPath)).rejects.toThrow("workloads.api.dependsOn");
  });
});
