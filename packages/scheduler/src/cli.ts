import { Command } from "commander";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { loadFailureArtifact, saveFailureArtifact } from "./artifact.js";
import { generateAdaptiveCandidateStages, generateFocusedCandidates } from "./candidates.js";
import { fakePlatform } from "./fake-platform.js";
import { discoverFailure, replayFailure } from "./orchestrator.js";
import { createOnboardingService, runSharedDiscovery, type SharedDiscoveryOptions } from "./onboarding.js";
import { chooseMenuAction, createReadlinePrompt, type PromptAdapter } from "./prompt.js";
import { renderDashboard, renderReplaySummary, renderResultSummary } from "./presentation.js";
import type { ExecutionPlatform, TargetConfig } from "@dsrd/contracts";

const defaultDelayOptionsMs = [0, 500, 1000, 1500, 2000, 3000];
const quickDelayOptionsMs = [0, 2500];

export type CliDependencies = {
  platform: ExecutionPlatform;
  log: (message: string) => void;
  sharedDiscovery?: (options: SharedDiscoveryOptions) => ReturnType<typeof runSharedDiscovery>;
  interactive?: boolean;
  useColor?: boolean;
  prompt?: PromptAdapter;
};

const composeTargetFiles = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

export async function resolveTargetPath(platform: string, targetPath: string): Promise<string> {
  const targetStat = await stat(targetPath);
  if (targetStat.isFile()) return targetPath;
  if (!targetStat.isDirectory()) throw new Error(`Target path is not a project directory or file: ${targetPath}`);

  const filenames = platform === "compose" ? composeTargetFiles : platform === "local-process" ? ["manifest.json"] : [];
  for (const filename of filenames) {
    const candidate = join(targetPath, filename);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next conventional project file.
    }
  }

  const description = platform === "compose" ? "Compose file" : platform === "local-process" ? "manifest.json" : "target file";
  throw new Error(`No ${description} found in project directory: ${targetPath}`);
}

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies = {
    platform: fakePlatform,
    log: console.log
  }
): Promise<number> {
  if (args.length === 0 && dependencies.interactive) {
    dependencies.log(renderDashboard(dependencies.useColor ?? false));
    const prompt = dependencies.prompt ?? createReadlinePrompt();

    try {
      const action = await chooseMenuAction(prompt, dependencies.log);
      if (action === "quit") {
        dependencies.log("See you next time.");
        return 0;
      }

      return runCli(await collectGuidedArgs(action, prompt, dependencies.log), {
        ...dependencies,
        prompt: undefined
      });
    } finally {
      prompt.close();
    }
  }

  const program = new Command();
  let exitCode = 0;
  const runSchedule = dependencies.platform.run.bind(dependencies.platform);
  const replaySchedule = dependencies.platform.replay.bind(dependencies.platform);
  program.name("race-debugger").description("Explore startup timing races");

  program
    .command("inspect")
    .description("inspect a checkout or pinned Git repository without executing it")
    .option("--checkout <path>", "repository checkout path")
    .option("--git <url>", "pinned Git repository URL")
    .option("--ref <ref>", "Git revision or ref", "HEAD")
    .option("--json", "emit a machine-readable inspection result")
    .action(async (options: { checkout?: string; git?: string; ref: string; json?: boolean }) => {
      if ((options.checkout === undefined) === (options.git === undefined)) throw new Error("Provide exactly one of --checkout or --git");
      const inspection = await createOnboardingService({ platform: dependencies.platform }).inspect({
        repository: options.checkout === undefined
          ? { kind: "git", url: options.git!, ref: options.ref, submodules: false, lfs: false }
          : { kind: "checkout", path: options.checkout },
      });
      if (options.json) {
        dependencies.log(JSON.stringify({ status: "inspected", ...inspection }));
      } else {
        dependencies.log(`Found ${inspection.candidates.length} target candidate(s).`);
      }
    });

  program
    .command("search")
    .description("search for a failing startup schedule")
    .option("-p, --platform <platform>", "target platform", "local-process")
    .option("-t, --target <path>", "project directory containing the target manifest", ".")
    .option("-d, --delay-options <milliseconds>", "comma-separated delay values")
    .option("--quick", "test one perturbation at a time with a small delay set")
    .option("-n, --max-runs <number>", "maximum physical schedule executions")
    .option("--baseline-runs <number>", "required consecutive healthy baseline runs")
    .option("--confirmation-runs <number>", "required matching failure confirmations")
    .option("--json", "emit one machine-readable terminal result")
    .option("-o, --output <path>", "artifact output path", "failure.json")
    .action(async (options: { platform: string; target: string; delayOptions?: string; quick?: boolean; maxRuns?: string; baselineRuns?: string; confirmationRuns?: string; output: string; json?: boolean }) => {
      const delayOptionsMs = options.delayOptions
        ? parseDelayOptions(options.delayOptions)
        : options.quick ? quickDelayOptionsMs : defaultDelayOptionsMs;
      const target = targetConfig(options.platform, await resolveTargetPath(options.platform, options.target));
      const workloads = await dependencies.platform.discover(target);
      const candidates = options.quick ? generateFocusedCandidates(workloads, delayOptionsMs) : undefined;
      const candidateStages = options.quick ? undefined : generateAdaptiveCandidateStages(workloads, delayOptionsMs);
      const candidateMaximum = candidates?.length ?? candidateStages?.at(-1)?.candidateCount ?? 0;
      const maxRuns = options.maxRuns === undefined ? undefined : parseMaxRuns(options.maxRuns);
      const baselineRuns = options.baselineRuns === undefined ? undefined : parseRunCount(options.baselineRuns, "Baseline runs");
      const confirmationRuns = options.confirmationRuns === undefined ? undefined : parseRunCount(options.confirmationRuns, "Confirmation runs");
      let runNumber = 0;
      let failureFound = false;
      const runWithProgress = async (runTarget: TargetConfig, schedule: Parameters<typeof runSchedule>[1]) => {
        runNumber += 1;
        const verificationLabel = failureFound ? "  (minimization/replay verification)" : "";
        if (!options.json) dependencies.log(`RUN ${runNumber.toString().padStart(2, "0")}${verificationLabel}  ${describeSchedule(schedule)}`);
        const runResult = await runSchedule(runTarget, schedule);
        if (runResult.status === "workload_failure") failureFound = true;
        if (!options.json) {
          dependencies.log(runResult.status === "healthy" ? "PASS" : "FAIL — race detected");
          dependencies.log("");
        }
        return runResult;
      };
      if (!options.json) dependencies.log(options.quick
        ? `Starting quick scan (${Math.min(maxRuns ?? candidateMaximum, candidateMaximum)} schedules maximum).`
        : `Starting adaptive thorough scan (${Math.min(maxRuns ?? candidateMaximum, candidateMaximum)} schedules maximum).`);
      if (!options.json) dependencies.log("");
      const result = await (dependencies.sharedDiscovery ?? runSharedDiscovery)({
        platform: dependencies.platform,
        delayOptionsMs,
        target,
        candidates,
        candidateStages,
        runSchedule: runWithProgress,
        replaySchedule,
        maxSchedules: maxRuns,
        baselineRuns,
        confirmationRuns,
      });

      if (result.status !== "found_failure") {
        exitCode = result.status === "no_failure" ? 0 : discoveryExitCode(result.status);
        if (options.json) {
          dependencies.log(JSON.stringify({ status: result.status, exitCode, testedSchedules: result.testedSchedules }));
          return;
        }
        dependencies.log(
          renderResultSummary({
            status: result.status === "no_failure" ? "no-failure" : result.status,
            testedSchedules: result.testedSchedules,
          })
        );
        return;
      }

      const artifactPath = resolve(options.output);
      await saveFailureArtifact(artifactPath, result.artifact);
      if (options.json) {
        dependencies.log(JSON.stringify({ status: "found_failure", exitCode: 0, testedSchedules: result.testedSchedules, artifactPath }));
        return;
      }
      const dimensions = workloads.reduce(
        (count, workload) => count + workload.perturbablePhases.length,
        0
      );
      dependencies.log(
        renderResultSummary({
          status: "failure",
          testedSchedules: result.testedSchedules,
          artifactPath,
          perturbations: result.artifact.minimizedSchedule.perturbations,
          failureReason: result.artifact.expectedFailureReason,
          events: result.artifact.events,
          useColor: dependencies.useColor,
          scope: { workloads: workloads.length, dimensions, candidates: candidateMaximum },
          exploredSchedules: result.exploredCandidateSchedules,
          physicalAttempts: result.testedSchedules,
          originalPerturbations: result.artifact.originalSchedule.perturbations.length
        })
      );
    });

  program
    .command("onboard-search")
    .description("search an explicitly configured checkout or pinned Git repository")
    .option("--checkout <path>", "repository checkout path")
    .option("--git <url>", "pinned Git repository URL")
    .option("--ref <ref>", "Git revision or ref", "HEAD")
    .option("--target-id <id>", "explicit inspected target id")
    .option("--config <path>", "repository-relative dsrd.yaml path")
    .option("--json", "emit one machine-readable terminal result")
    .option("-o, --output <path>", "artifact output path", "failure.json")
    .action(async (options: { checkout?: string; git?: string; ref: string; targetId?: string; config?: string; json?: boolean; output: string }) => {
      if ((options.checkout === undefined) === (options.git === undefined)) throw new Error("Provide exactly one of --checkout or --git");
      const result = await createOnboardingService({ platform: dependencies.platform }).search({
        repository: options.checkout === undefined
          ? { kind: "git", url: options.git!, ref: options.ref, submodules: false, lfs: false }
          : { kind: "checkout", path: options.checkout },
        targetId: options.targetId,
        configPath: options.config,
      });
      exitCode = result.status === "found_failure" || result.status === "no_failure" ? 0 : discoveryExitCode(result.status);
      if (result.status === "found_failure") {
        const artifactPath = resolve(options.output);
        await saveFailureArtifact(artifactPath, result.artifact);
        dependencies.log(options.json ? JSON.stringify({ status: result.status, exitCode, testedSchedules: result.testedSchedules, artifactPath }) : `Failure artifact saved: ${artifactPath}`);
        return;
      }
      dependencies.log(options.json ? JSON.stringify({ status: result.status, exitCode, testedSchedules: result.testedSchedules, ...("diagnostics" in result ? { diagnostics: result.diagnostics } : {}) }) : result.status);
    });

  program
    .command("replay <artifactPath>")
    .description("replay a saved failure artifact")
    .option("--json", "emit one machine-readable terminal result")
    .action(async (artifactPath: string, options: { json?: boolean }) => {
      const artifact = await loadFailureArtifact(artifactPath);
      const result = await replayFailure(artifact, replaySchedule);
      exitCode = result.status === "reproduced" ? 0 : 4;
      const evidenceMatched = artifact.events.filter((expected) =>
        result.result.events.some((actual) =>
          actual.service === expected.service && actual.event === expected.event
        )
      ).length;
      if (options.json) {
        dependencies.log(JSON.stringify({ status: result.status, exitCode, result: result.result }));
        return;
      }
      dependencies.log(renderReplaySummary(
        artifact,
        result.result,
        result.status === "reproduced" ? "reproduced" : "not-reproduced",
        dependencies.useColor,
        evidenceMatched
      ));
    });

  if (args.length === 0) {
    dependencies.log(program.helpInformation());
    return 0;
  }

  await program.parseAsync(["node", "race-debugger", ...args]);
  return exitCode;
}

function discoveryExitCode(status: Exclude<Parameters<typeof renderResultSummary>[0]["status"], "failure" | "reproduced" | "not-reproduced" | "no-failure">): number {
  switch (status) {
    case "needs_configuration": return 2;
    case "unsupported_target": return 3;
    case "target_unhealthy": return 4;
    case "execution_error": return 5;
    case "inconclusive": return 6;
    case "cancelled": return 130;
  }
}

async function collectGuidedArgs(
  action: "search" | "replay",
  prompt: PromptAdapter,
  log: (message: string) => void
): Promise<string[]> {
  if (action === "search") {
    log("\nWhat do you want to test?");
    log("[1] Docker Compose");
    log("[2] Local process");
    const platform = await choosePlatform(prompt, log);
    const target = await chooseExistingTarget(platform, prompt, log);
    log("\nScan mode:");
    log("[1] Quick scan — recommended");
    log("[2] Thorough scan");
    const quick = await chooseQuickMode(prompt, log);
    const output = cleanPath(await prompt.ask("Save results as [failure.json]: ")) || "failure.json";
    return [
      "search",
      "--platform",
      platform,
      "--target",
      target,
      ...(quick ? ["--quick"] : []),
      "--output",
      output
    ];
  }

  while (true) {
    const artifactPath = (await prompt.ask("Failure artifact path: ")).trim();
    if (artifactPath) return ["replay", artifactPath];
    log("Artifact path is required.");
  }
}

async function choosePlatform(prompt: PromptAdapter, log: (message: string) => void): Promise<"compose" | "local-process"> {
  while (true) {
    const answer = (await prompt.ask("Choose a platform: ")).trim();
    if (answer === "" || answer === "1") return "compose";
    if (answer === "2") return "local-process";
    log("Choose 1 for Docker Compose or 2 for local process.");
  }
}

async function chooseQuickMode(prompt: PromptAdapter, log: (message: string) => void): Promise<boolean> {
  while (true) {
    const answer = (await prompt.ask("Choose a scan mode: ")).trim();
    if (answer === "" || answer === "1") return true;
    if (answer === "2") return false;
    log("Choose 1 for quick scan or 2 for thorough scan.");
  }
}

async function chooseExistingTarget(
  platform: "compose" | "local-process",
  prompt: PromptAdapter,
  log: (message: string) => void
): Promise<string> {
  const message = platform === "compose" ? "Compose project directory: " : "Local-process project directory: ";
  while (true) {
    const path = cleanPath(await prompt.ask(message));
    if (!path) { log("A project directory is required."); continue; }
    try {
      return await resolveTargetPath(platform, path);
    } catch (error) {
      log(error instanceof Error && error.message.startsWith("No ") ? error.message : `File not found: ${path}`);
    }
  }
}

function cleanPath(value: string): string {
  const path = value.trim();
  if (path.length >= 2 && ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'")))) {
    return path.slice(1, -1);
  }
  return path;
}

function describeSchedule(schedule: { perturbations: Array<{ workloadId: string; phase: string; delayMs: number }> }): string {
  if (schedule.perturbations.length === 0) return "Testing baseline...";
  const [first, ...remaining] = schedule.perturbations;
  return `Delaying ${first.workloadId} ${first.phase} by ${first.delayMs}ms${remaining.length ? ` (+${remaining.length} more)` : ""}...`;
}

function targetConfig(platform: string, targetPath: string): TargetConfig {
  switch (platform) {
    case "compose":
      return { platform, composeFile: targetPath };
    case "local-process":
      return { platform, manifestPath: targetPath };
    case "kubernetes":
      return { platform, manifestPath: targetPath };
    default:
      throw new Error(`Unsupported target platform: ${platform}`);
  }
}

function parseDelayOptions(input: string): number[] {
  const values = input.split(",").map((value) => Number(value.trim()));
  if (
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error("Delay options must be comma-separated non-negative numbers");
  }
  return values;
}

function parseMaxRuns(input: string): number {
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Maximum runs must be a positive integer");
  }
  return value;
}

function parseRunCount(input: string, label: string): number {
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}
