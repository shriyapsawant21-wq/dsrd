import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { loadFailureArtifact } from "./artifact.js";
import { runCli } from "./cli.js";
import { createDefaultPlatform } from "./default-platform.js";
import { createPlatformRouter } from "./default-platform.js";
import type { ExecutionPlatform, RunResult, Schedule, TargetConfig, Workload } from "@dsrd/contracts";

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
  it("routes each target to its implemented backend", async () => {
    const local = new RecordingPlatform("local");
    const compose = new RecordingPlatform("compose");
    const platform = createPlatformRouter({ localProcess: local, composeFor: () => compose });

    await platform.discover({ platform: "local-process", manifestPath: "race.json" });
    await platform.run({ platform: "compose", composeFile: "compose.yaml" }, { id: "s1", perturbations: [] });

    expect(local.calls).toEqual(["discover:local-process"]);
    expect(compose.calls).toEqual(["run:compose"]);
  });

  it("reports Kubernetes as unavailable until C7 is integrated", async () => {
    const platform = createPlatformRouter({
      localProcess: new RecordingPlatform("local"),
      composeFor: () => new RecordingPlatform("compose"),
    });

    await expect(platform.discover({ platform: "kubernetes", manifestPath: "app.yaml" }))
      .rejects.toThrow("Kubernetes support is not available until C7 is integrated");
  });

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

class RecordingPlatform implements ExecutionPlatform {
  readonly calls: string[] = [];
  constructor(private readonly label: string) {}
  async discover(target: TargetConfig): Promise<Workload[]> { this.calls.push(`discover:${target.platform}`); return []; }
  async reset(target: TargetConfig): Promise<void> { this.calls.push(`reset:${target.platform}`); }
  async run(target: TargetConfig, _schedule: Schedule): Promise<RunResult> { this.calls.push(`run:${target.platform}`); return result(this.label); }
  async replay(target: TargetConfig, _schedule: Schedule): Promise<RunResult> { this.calls.push(`replay:${target.platform}`); return result(this.label); }
}

function result(scheduleId: string): RunResult {
  return { scheduleId, status: "pass", events: [], logs: [] };
}
