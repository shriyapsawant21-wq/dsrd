import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { loadFailureArtifact } from "./artifact.js";
import { runCli } from "./cli.js";
import { createDefaultPlatform } from "./default-platform.js";

const manifestPath = fileURLToPath(
  new URL("../../../fixtures/local-startup-race/manifest.json", import.meta.url),
);
const target = { platform: "local-process" as const, manifestPath };
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
  directories.length = 0;
});

describe("createDefaultPlatform", () => {
  it("selects the local-process adapter for manifest targets", async () => {
    const platform = createDefaultPlatform();

    await expect(platform.discover(target)).resolves.toContainEqual({
      id: "bootstrap",
      kind: "initializer",
      perturbablePhases: ["ready"],
    });
  });

  it("discovers, minimizes, saves, and replays the local startup race", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-process-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    const platform = createDefaultPlatform();
    const output: string[] = [];

    await runCli([
      "search", "--platform", "local-process", "--target", manifestPath,
      "--delay-options", "0,100", "--output", artifactPath,
    ], { platform, log: (message) => output.push(message) });

    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({
      target,
      minimizedSchedule: {
        perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 100 }],
      },
    });
    await runCli(["replay", artifactPath], { platform, log: (message) => output.push(message) });
    expect(output.join("\n")).toContain("Replay reproduced expected failure");
  });
});
