import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionPlatform, RunResult, Schedule, TargetConfig, Workload } from "@dsrd/contracts";

import { loadFailureArtifact } from "./artifact.js";
import { resolveTargetPath, runCli } from "./cli.js";
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
  it("resolves a Compose project directory to its conventional compose file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-project-"));
    directories.push(directory);
    await writeFile(join(directory, "compose.yaml"), "services: {}\n");

    await expect(resolveTargetPath("compose", directory)).resolves.toBe(join(directory, "compose.yaml"));
  });

  it("resolves a local-process project directory to its manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-project-"));
    directories.push(directory);
    await writeFile(join(directory, "manifest.json"), "{\"workloads\": []}\n");

    await expect(resolveTargetPath("local-process", directory)).resolves.toBe(join(directory, "manifest.json"));
  });

  it("reports when a project directory has no recognized target file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-project-"));
    directories.push(directory);

    await expect(resolveTargetPath("compose", directory)).rejects.toThrow(
      "No Compose file found in project directory",
    );
  });

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
    const manifestPath = join(directory, "race.json");
    await writeFile(manifestPath, "{}");
    const answers = ["s", "2", manifestPath, "1", artifactPath];
    const output: string[] = [];
    const prompts: string[] = [];

    await runCli([], {
      platform: fakePlatform,
      log: (message) => output.push(message),
      interactive: true,
      useColor: false,
      prompt: { ask: async (message) => { prompts.push(message); return answers.shift() ?? ""; }, close: () => undefined }
    });

    expect(output.join("\n")).toContain("Discover, minimize, and replay startup race conditions.");
    expect(output.join("\n")).toContain("[1] Docker Compose");
    expect(prompts).toContain("Local-process project directory: ");
    expect(prompts).toContain("Save results as [failure.json]: ");
    expect(output.join("\n")).toContain("RUN 01");
    expect(output.join("\n")).toContain("PASS\n\nRUN 02");
    expect(output.join("\n")).toContain("FAIL — race detected\n\nRUN 03");
    expect(output.join("\n")).toContain("\n\nFailure found");
    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({ version: 2 });
  });

  it("retries when the guided target file does not exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const composePath = join(directory, "compose.yaml");
    const artifactPath = join(directory, "failure.json");
    await writeFile(composePath, "services: {}");
    const answers = ["s", "1", "missing.yaml", composePath, "1", artifactPath];
    const output: string[] = [];

    await runCli([], {
      platform: fakePlatform,
      log: (message) => output.push(message),
      interactive: true,
      prompt: { ask: async () => answers.shift() ?? "", close: () => undefined },
    });

    expect(output.join("\n")).toContain("File not found: missing.yaml");
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
    await writeFile(join(directory, "manifest.json"), "{}\n");
    const output: string[] = [];

    await runCli(
      ["search", "--platform", "local-process", "--target", directory, "--output", artifactPath],
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
    await writeFile(join(directory, "manifest.json"), "{}\n");
    await runCli(
      ["search", "--target", directory, "--output", artifactPath],
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
    await writeFile(join(directory, "manifest.json"), "{}\n");

    await runCli(["search", "--target", directory, "--output", artifactPath], {
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
