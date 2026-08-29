import { Command } from "commander";

import { loadFailureArtifact, saveFailureArtifact } from "./artifact.js";
import { generateCandidates } from "./candidates.js";
import { fakePlatform } from "./fake-platform.js";
import { discoverFailure, replayFailure } from "./orchestrator.js";
import type { ExecutionPlatform, TargetConfig } from "@dsrd/contracts";

const defaultDelayOptionsMs = [0, 500, 1000, 1500, 2000, 3000];

export type CliDependencies = {
  platform: ExecutionPlatform;
  log: (message: string) => void;
};

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies = {
    platform: fakePlatform,
    log: console.log
  }
): Promise<void> {
  const program = new Command();
  program.name("race-debugger").description("Explore startup timing races");

  program
    .command("search")
    .description("search for a failing startup schedule")
    .option("-p, --platform <platform>", "target platform", "local-process")
    .option("-t, --target <path>", "target manifest or compose file", "race.json")
    .option("-d, --delay-options <milliseconds>", "comma-separated delay values")
    .option("-o, --output <path>", "artifact output path", "failure.json")
    .action(async (options: { platform: string; target: string; delayOptions?: string; output: string }) => {
      const delayOptionsMs = options.delayOptions
        ? parseDelayOptions(options.delayOptions)
        : defaultDelayOptionsMs;
      const target = targetConfig(options.platform, options.target);
      const workloads = await dependencies.platform.discover(target);
      const candidates = generateCandidates(workloads, delayOptionsMs);
      const result = await discoverFailure({
        candidates,
        delayOptionsMs,
        target,
        runSchedule: dependencies.platform.run
      });

      if (result.status === "no_failure") {
        dependencies.log(`No failure found after ${result.testedSchedules} schedules.`);
        return;
      }

      await saveFailureArtifact(options.output, result.artifact);
      dependencies.log(`Failure found after ${result.testedSchedules} schedules.`);
      dependencies.log(`Saved replay artifact: ${options.output}`);
    });

  program
    .command("replay <artifactPath>")
    .description("replay a saved failure artifact")
    .action(async (artifactPath: string) => {
      const artifact = await loadFailureArtifact(artifactPath);
      const result = await replayFailure(artifact, dependencies.platform.replay);
      dependencies.log(
        result.status === "reproduced"
          ? "Replay reproduced expected failure."
          : "Replay did not reproduce expected failure."
      );
    });

  await program.parseAsync(["node", "race-debugger", ...args]);
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
