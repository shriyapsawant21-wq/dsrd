import { Command } from "commander";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { loadFailureArtifact, saveFailureArtifact } from "./artifact.js";
import { generateCandidates, generateFocusedCandidates } from "./candidates.js";
import { fakePlatform } from "./fake-platform.js";
import { discoverFailure, replayFailure } from "./orchestrator.js";
import { chooseMenuAction, createReadlinePrompt, type PromptAdapter } from "./prompt.js";
import { renderDashboard, renderReplaySummary, renderResultSummary } from "./presentation.js";
import type { ExecutionPlatform, TargetConfig } from "@dsrd/contracts";

const defaultDelayOptionsMs = [0, 500, 1000, 1500, 2000, 3000];
const quickDelayOptionsMs = [0, 2500];

export type CliDependencies = {
  platform: ExecutionPlatform;
  log: (message: string) => void;
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
): Promise<void> {
  if (args.length === 0 && dependencies.interactive) {
    dependencies.log(renderDashboard(dependencies.useColor ?? false));
    const prompt = dependencies.prompt ?? createReadlinePrompt();

    try {
      const action = await chooseMenuAction(prompt, dependencies.log);
      if (action === "quit") {
        dependencies.log("See you next time.");
        return;
      }

      await runCli(await collectGuidedArgs(action, prompt, dependencies.log), {
        ...dependencies,
        prompt: undefined
      });
      return;
    } finally {
      prompt.close();
    }
  }

  const program = new Command();
  const runSchedule = dependencies.platform.run.bind(dependencies.platform);
  const replaySchedule = dependencies.platform.replay.bind(dependencies.platform);
  program.name("race-debugger").description("Explore startup timing races");

  program
    .command("search")
    .description("search for a failing startup schedule")
    .option("-p, --platform <platform>", "target platform", "local-process")
    .option("-t, --target <path>", "project directory containing the target manifest", ".")
    .option("-d, --delay-options <milliseconds>", "comma-separated delay values")
    .option("-n, --max-runs <number>", "maximum candidate schedules to execute")
    .option("--quick", "test one perturbation at a time with a small delay set")
    .option("-o, --output <path>", "artifact output path", "failure.json")
    .action(async (options: { platform: string; target: string; delayOptions?: string; quick?: boolean; maxRuns?: string; output: string }) => {
      const delayOptionsMs = options.delayOptions
        ? parseDelayOptions(options.delayOptions)
        : options.quick ? quickDelayOptionsMs : defaultDelayOptionsMs;
      const target = targetConfig(options.platform, await resolveTargetPath(options.platform, options.target));
      const workloads = await dependencies.platform.discover(target);
      const candidates = options.quick
        ? generateFocusedCandidates(workloads, delayOptionsMs)
        : generateCandidates(workloads, delayOptionsMs);
      const maxSchedules = options.maxRuns === undefined ? undefined : parseMaxRuns(options.maxRuns);
      let runNumber = 0;
      let failureFound = false;
      const runWithProgress = async (runTarget: TargetConfig, schedule: Parameters<typeof runSchedule>[1]) => {
        runNumber += 1;
        const verificationLabel = failureFound ? "  (minimization/replay verification)" : "";
        dependencies.log(`RUN ${runNumber.toString().padStart(2, "0")}${verificationLabel}  ${describeSchedule(schedule)}`);
        const runResult = await runSchedule(runTarget, schedule);
        if (runResult.status === "fail") failureFound = true;
        dependencies.log(runResult.status === "pass" ? "PASS" : "FAIL — race detected");
        dependencies.log("");
        return runResult;
      };
      dependencies.log(options.quick
        ? `Starting quick scan (${Math.min(maxSchedules ?? candidates.length, candidates.length)} schedules maximum).`
        : `Starting thorough scan (${Math.min(maxSchedules ?? candidates.length, candidates.length)} schedules maximum).`);
      dependencies.log("");
      const result = await discoverFailure({
        candidates,
        delayOptionsMs,
        target,
        runSchedule: runWithProgress,
        maxSchedules
      });

      if (result.status === "no_failure") {
        dependencies.log(
          renderResultSummary({ status: "no-failure", testedSchedules: result.testedSchedules })
        );
        return;
      }

      const artifactPath = resolve(options.output);
      await saveFailureArtifact(artifactPath, result.artifact);
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
          scope: { workloads: workloads.length, dimensions, candidates: candidates.length },
          exploredSchedules: result.testedSchedules,
          originalPerturbations: result.artifact.originalSchedule.perturbations.length
        })
      );
    });

  program
    .command("replay <artifactPath>")
    .description("replay a saved failure artifact")
    .action(async (artifactPath: string) => {
      const artifact = await loadFailureArtifact(artifactPath);
      const result = await replayFailure(artifact, replaySchedule);
      const evidenceMatched = artifact.events.filter((expected) =>
        result.result.events.some((actual) =>
          actual.service === expected.service && actual.event === expected.event
        )
      ).length;
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
    return;
  }

  await program.parseAsync(["node", "race-debugger", ...args]);
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
  const value = Number(input.trim());
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Maximum runs must be a positive integer");
  }
  return value;
}
