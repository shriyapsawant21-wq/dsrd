import { Command } from "commander";

import { loadFailureArtifact, saveFailureArtifact } from "./artifact.js";
import { generateCandidates } from "./candidates.js";
import { fakePlatform } from "./fake-platform.js";
import { discoverFailure, replayFailure } from "./orchestrator.js";
import { chooseMenuAction, createReadlinePrompt, type PromptAdapter } from "./prompt.js";
import { renderDashboard, renderResultSummary } from "./presentation.js";
import type { ExecutionPlatform, TargetConfig } from "@dsrd/contracts";

const defaultDelayOptionsMs = [0, 500, 1000, 1500, 2000, 3000];

export type CliDependencies = {
  platform: ExecutionPlatform;
  log: (message: string) => void;
  interactive?: boolean;
  useColor?: boolean;
  prompt?: PromptAdapter;
};

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
        runSchedule
      });

      if (result.status === "no_failure") {
        dependencies.log(
          renderResultSummary({ status: "no-failure", testedSchedules: result.testedSchedules })
        );
        return;
      }

      await saveFailureArtifact(options.output, result.artifact);
      dependencies.log(
        renderResultSummary({
          status: "failure",
          testedSchedules: result.testedSchedules,
          artifactPath: options.output
        })
      );
    });

  program
    .command("replay <artifactPath>")
    .description("replay a saved failure artifact")
    .action(async (artifactPath: string) => {
      const artifact = await loadFailureArtifact(artifactPath);
      const result = await replayFailure(artifact, replaySchedule);
      dependencies.log(
        renderResultSummary({
          status: result.status === "reproduced" ? "reproduced" : "not-reproduced"
        })
      );
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
    const platform = (await prompt.ask("Platform [local-process]: ")).trim() || "local-process";
    const target = (await prompt.ask("Target [race.json]: ")).trim() || "race.json";
    const delayOptions = (await prompt.ask("Delay options (comma-separated, optional): ")).trim();
    const output = (await prompt.ask("Replay artifact [failure.json]: ")).trim() || "failure.json";
    return [
      "search",
      "--platform",
      platform,
      "--target",
      target,
      ...(delayOptions ? ["--delay-options", delayOptions] : []),
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
