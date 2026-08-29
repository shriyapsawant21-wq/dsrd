import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionPlatform, RunResult, Schedule, TargetConfig, Workload } from "@dsrd/contracts";

import { loadFailureArtifact } from "./artifact.js";
import { runCli } from "./cli.js";
import { fakePlatform } from "./fake-platform.js";

const directories: string[] = [];

class ReceiverDependentPlatform implements ExecutionPlatform {
  runCalls = 0;
  replayCalls = 0;

  discover(_target: TargetConfig): Promise<Workload[]> {
    return fakePlatform.discover(_target);
  }

  reset(_target: TargetConfig): Promise<void> {
    return fakePlatform.reset(_target);
  }

  async run(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    this.runCalls += 1;
    return fakePlatform.run(target, schedule);
  }

  async replay(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    this.replayCalls += 1;
    return fakePlatform.replay(target, schedule);
  }
}

afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true })));
  directories.length = 0;
});

describe("race-debugger CLI", () => {
  it("documents the bare interactive command", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Run `race-debugger` with no command");
    expect(readme).toContain("race-debugger search");
    expect(readme).toContain("race-debugger replay failure.json");
    expect(readme).toContain("PowerShell and POSIX replay hints");
  });

  it("shows the dashboard and routes interactive Search through Commander", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    const answers = ["s", "", "race.json", "", artifactPath];
    const output: string[] = [];

    await runCli([], {
      platform: fakePlatform,
      log: (message) => output.push(message),
      interactive: true,
      useColor: false,
      prompt: { ask: async () => answers.shift() ?? "", close: () => undefined }
    });

    expect(output.join("\n")).toContain("Discover, minimize, and replay startup race conditions.");
    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({ version: 2 });
  });

  it("quits from the dashboard without platform execution", async () => {
    const platform = new ReceiverDependentPlatform();
    const output: string[] = [];

    await runCli([], {
      platform,
      log: (message) => output.push(message),
      interactive: true,
      prompt: { ask: async () => "q", close: () => undefined }
    });

    expect(platform.runCalls).toBe(0);
    expect(platform.replayCalls).toBe(0);
    expect(output.join("\n")).toContain("See you next time.");
  });

  it("does not prompt for a bare non-interactive invocation", async () => {
    let prompted = false;

    await runCli([], {
      platform: fakePlatform,
      log: () => undefined,
      interactive: false,
      prompt: {
        ask: async () => {
          prompted = true;
          return "s";
        },
        close: () => undefined
      }
    });

    expect(prompted).toBe(false);
  });

  it("searches with the injected runner and writes a replay artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    const output: string[] = [];

    await runCli(
      ["search", "--platform", "local-process", "--target", "race.json", "--output", artifactPath],
      { platform: fakePlatform, log: (message) => output.push(message) }
    );

    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({
      minimizedSchedule: {
        perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }]
      }
    });
    expect(output.join("\n")).toContain("Failure found");
  });

  it("replays the saved minimized schedule through the injected runner", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    await runCli(
      ["search", "--output", artifactPath],
      { platform: fakePlatform, log: () => undefined }
    );
    const output: string[] = [];

    await runCli(["replay", artifactPath], {
      platform: fakePlatform,
      log: (message) => output.push(message)
    });

    expect(output.join("\n")).toContain("Replay reproduced expected failure");
  });

  it("keeps the execution platform receiver for search and replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    const platform = new ReceiverDependentPlatform();

    await runCli(["search", "--output", artifactPath], {
      platform,
      log: () => undefined,
    });
    await runCli(["replay", artifactPath], {
      platform,
      log: () => undefined,
    });

    expect(platform.runCalls).toBeGreaterThan(0);
    expect(platform.replayCalls).toBe(1);
  });
});
