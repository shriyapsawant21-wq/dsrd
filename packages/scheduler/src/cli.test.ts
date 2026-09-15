import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionPlatform, RunResult, Schedule, TargetConfig, Workload } from "@dsrd/contracts";

import { loadFailureArtifact } from "./artifact.js";
import { resolveTargetPath, runCli } from "./cli.js";
import { fakePlatform } from "./fake-platform.js";
import { runSharedDiscovery } from "./onboarding.js";

const directories: string[] = [];
const execFile = promisify(execFileCallback);

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
  it("emits one stable JSON terminal record for scriptable searches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-json-"));
    directories.push(directory);
    await writeFile(join(directory, "manifest.json"), "{}\n");
    const output: string[] = [];

    const exitCode = await runCli([
      "search", "--json", "--target", directory, "--output", join(directory, "failure.json"),
    ], { platform: fakePlatform, log: (message) => output.push(message) });

    expect(exitCode).toBe(0);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({
      status: "found_failure",
      exitCode: 0,
      artifactPath: join(directory, "failure.json"),
    });
  });

  it("emits one JSON terminal error for invalid direct-search input", async () => {
    const output: string[] = [];
    await expect(runCli(["search", "--platform", "unsupported", "--json"], {
      platform: fakePlatform,
      log: (message) => output.push(message),
    })).resolves.toBe(5);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "execution_error", exitCode: 5 });
  });

  it("emits one JSON terminal error for a malformed replay artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-replay-json-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    await writeFile(artifactPath, "{not valid JSON");
    const output: string[] = [];

    await expect(runCli(["replay", artifactPath, "--json"], {
      platform: fakePlatform,
      log: (message) => output.push(message),
    })).resolves.toBe(5);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "execution_error", exitCode: 5 });
  });

  it("inspects a checkout through the onboarding service in JSON mode", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-inspect-"));
    directories.push(directory);
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ workloads: [] }));
    const output: string[] = [];

    await expect(runCli(["inspect", "--checkout", directory, "--json"], {
      platform: fakePlatform,
      log: (message) => output.push(message),
    })).resolves.toBe(0);

    expect(JSON.parse(output[0]!)).toMatchObject({ status: "inspected", candidates: [expect.objectContaining({ adapter: "local-process" })] });
  });

  it("emits a stable JSON error when checkout inspection fails", async () => {
    const output: string[] = [];

    await expect(runCli(["inspect", "--checkout", join(tmpdir(), "missing-checkout"), "--json"], {
      platform: fakePlatform,
      log: (message) => output.push(message),
    })).resolves.toBe(5);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "execution_error", exitCode: 5 });
  });

  it("searches a configured checkout through onboard-search and saves a v3 artifact", async () => {
    const directory = await onboardingFixture("dsrd-cli-onboard-checkout-");
    const artifactPath = join(directory, "failure.json");
    const output: string[] = [];

    await expect(runCli(["onboard-search", "--checkout", directory, "--json", "--output", artifactPath], {
      platform: signaturePlatform(),
      log: (message) => output.push(message),
    })).resolves.toBe(0);

    expect(JSON.parse(output[0]!)).toMatchObject({ status: "found_failure", exitCode: 0, artifactPath });
    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({ version: 3, repository: { contentDigest: expect.any(String) } });
  });

  it("searches a pinned local Git revision through onboard-search", async () => {
    const directory = await onboardingFixture("dsrd-cli-onboard-git-");
    await execFile("git", ["init", directory]);
    await execFile("git", ["-C", directory, "config", "user.email", "test@example.com"]);
    await execFile("git", ["-C", directory, "config", "user.name", "Test"]);
    await execFile("git", ["-C", directory, "add", "manifest.json", "dsrd.yaml"]);
    await execFile("git", ["-C", directory, "commit", "-m", "fixture"]);
    const revision = (await execFile("git", ["-C", directory, "rev-parse", "HEAD"])).stdout.trim();
    const artifactPath = join(directory, "failure.json");
    const output: string[] = [];

    await expect(runCli(["onboard-search", "--git", `file://${directory}`, "--ref", revision, "--json", "--output", artifactPath], {
      platform: signaturePlatform(),
      log: (message) => output.push(message),
    })).resolves.toBe(0);

    expect(JSON.parse(output[0]!)).toMatchObject({ status: "found_failure", exitCode: 0, artifactPath });
    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({ version: 3, repository: { resolvedRevision: revision } });
  });

  it("emits one JSON terminal error for malformed onboarding Git input", async () => {
    const output: string[] = [];

    await expect(runCli(["onboard-search", "--git", "not-a-url", "--json"], {
      platform: signaturePlatform(),
      log: (message) => output.push(message),
    })).resolves.toBe(5);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "execution_error", exitCode: 5 });
  });

  it("delegates scriptable searches to the shared discovery service", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-shared-"));
    directories.push(directory);
    await writeFile(join(directory, "manifest.json"), "{}\n");
    let calls = 0;

    await runCli(["search", "--target", directory, "--output", join(directory, "failure.json")], {
      platform: fakePlatform,
      log: () => undefined,
      sharedDiscovery: async (options) => {
        calls += 1;
        return runSharedDiscovery(options);
      },
    });

    expect(calls).toBe(1);
  });

  it("keeps every discovery terminal status on its documented JSON exit code", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-terminal-status-"));
    directories.push(directory);
    await writeFile(join(directory, "manifest.json"), "{}\n");
    const cases = [
      ["no_failure", 0],
      ["needs_configuration", 2],
      ["unsupported_target", 3],
      ["target_unhealthy", 4],
      ["execution_error", 5],
      ["inconclusive", 6],
      ["cancelled", 130],
    ] as const;

    for (const [status, expectedExitCode] of cases) {
      const output: string[] = [];
      await expect(runCli(["search", "--target", directory, "--json"], {
        platform: fakePlatform,
        log: (message) => output.push(message),
        sharedDiscovery: async () => ({ status, testedSchedules: 0, exploredCandidateSchedules: 0 }),
      })).resolves.toBe(expectedExitCode);
      expect(output).toHaveLength(1);
      expect(JSON.parse(output[0]!)).toMatchObject({ status, exitCode: expectedExitCode });
    }
  });

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

  it("validates explicit baseline and confirmation run counts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-project-"));
    directories.push(directory);
    const manifestPath = join(directory, "manifest.json");
    await writeFile(manifestPath, "{}");

    await expect(runCli([
      "search", "--platform", "local-process", "--target", manifestPath,
      "--baseline-runs", "0",
    ], { platform: fakePlatform, log: () => undefined })).rejects.toThrow(
      "Baseline runs must be a positive integer",
    );
    await expect(runCli([
      "search", "--platform", "local-process", "--target", manifestPath,
      "--confirmation-runs", "0",
    ], { platform: fakePlatform, log: () => undefined })).rejects.toThrow(
      "Confirmation runs must be a positive integer",
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
    expect(prompts).toContain("Choose a platform: ");
    expect(prompts).toContain("Choose a scan mode: ");
    expect(prompts).not.toContain("Choose a platform [1]: ");
    expect(prompts).not.toContain("Choose a scan mode [1]: ");
    expect(prompts).toContain("Save results as [failure.json]: ");
    expect(output.join("\n")).toContain("RUN 01");
    expect(output.join("\n")).toContain("PASS\n\nRUN 02");
    expect(output.join("\n")).toContain("RUN 03  Testing baseline...\nPASS\n\nRUN 04");
    expect(output.join("\n")).toContain("\n\nFailure found");
    expect(output.join("\n")).toContain("Found at perturbation: bootstrap ready +2500ms");
    expect(output.join("\n")).toContain("Failure reason: fake platform: bootstrap unavailable");
    expect(output.join("\n")).toContain("Failure evidence: api startup_failed at 2500ms — fake platform: bootstrap was not ready");
    expect(output.join("\n")).toContain("Search scope:");
    expect(output.join("\n")).toContain("Scope explored: 1 of 3 candidate schedules (stopped at first failure).");
    expect(output.join("\n")).toContain("Physical attempts: 9.");
    expect(output.join("\n")).toContain("Minimization: 1 perturbation(s) → 1 perturbation(s).");
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

  it("returns a stable success exit code after publishing a verified artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-exit-"));
    directories.push(directory);
    await writeFile(join(directory, "manifest.json"), "{}\n");

    await expect(runCli(
      ["search", "--platform", "local-process", "--target", directory, "--output", join(directory, "failure.json")],
      { platform: fakePlatform, log: () => undefined },
    )).resolves.toBe(0);
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
    expect(output.join("\n")).toContain("Replay target:");
    expect(output.join("\n")).toContain("Replay perturbation: bootstrap ready +1000ms");
    expect(output.join("\n")).toContain("Expected failure: fake platform: bootstrap unavailable");
    expect(output.join("\n")).toContain("Observed failure: fake platform: bootstrap unavailable");
    expect(output.join("\n")).toContain("Replay evidence: api startup_failed at 1000ms — fake platform: bootstrap was not ready");
    expect(output.join("\n")).toContain("Replay execution: WORKLOAD_FAILURE");
    expect(output.join("\n")).toContain("Evidence matched: 1/1 timeline events.");
  });

  it("emits one stable JSON terminal record for replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-replay-json-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    await writeFile(join(directory, "manifest.json"), "{}\n");
    await runCli(["search", "--target", directory, "--output", artifactPath], { platform: fakePlatform, log: () => undefined });
    const output: string[] = [];

    await expect(runCli(["replay", artifactPath, "--json"], {
      platform: fakePlatform,
      log: (message) => output.push(message),
    })).resolves.toBe(0);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ status: "reproduced", exitCode: 0, result: { status: "workload_failure" } });
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
    expect(platform.replayCalls).toBe(2);
  });
});

async function onboardingFixture(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.push(directory);
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ workloads: [] }));
  await writeFile(join(directory, "dsrd.yaml"), [
    "version: 1",
    "target:",
    "  id: local-process:manifest.json",
    "  adapter: local-process",
    "  root: .",
    "workloads:",
    "  api:",
    "    kind: process",
    "    command: [node, app.js]",
    "    readiness: { id: api-ready, type: http, url: http://127.0.0.1:3000/health, observer: host, expectedStatus: 200 }",
    "state: { policy: fresh-owned }",
    "experiment: { baselineRuns: 1, confirmationRuns: 1, replayRuns: 1, maxExecutions: 100, maxInFlight: 1, delayOptionsMs: [0, 1000], timeouts: { acquisitionMs: 1000, preflightMs: 1000, runMs: 1000, readinessMs: 1000, cleanupMs: 1000 } }",
  ].join("\n"));
  return directory;
}

function signaturePlatform(): ExecutionPlatform {
  const run = async (target: TargetConfig, schedule: Schedule): Promise<RunResult> => {
    const result = await fakePlatform.run(target, schedule);
    return result.status === "workload_failure"
      ? { ...result, failureSignature: { workloadId: "api", assertionId: "bootstrap-ready", category: "readiness_failed" } }
      : result;
  };
  return { discover: fakePlatform.discover, reset: fakePlatform.reset, run, replay: run };
}
