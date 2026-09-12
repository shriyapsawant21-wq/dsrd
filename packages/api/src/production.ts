import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type { ExecutionPlatform, TargetConfig, Workload } from "@dsrd/contracts";
import { ComposeProofObserver, WorkloadProofObserver } from "@dsrd/proof";
import { ComposeExecutionPlatform, DockerComposeClient, DockerComposeServiceDiscovery, DockerRuntimeController, LocalProcessExecutionPlatform, NodeCommandRunner, SystemDelay } from "@dsrd/runtime";
import { discoverFailure, generateCandidates, type DiscoveryResult } from "@dsrd/scheduler";
import type { DiscoveryRunner } from "./run-service.js";

export function createProductionDiscoveryRunner(): DiscoveryRunner {
  return async (target, onProgress) => {
    let workloads: Workload[] = [];
    const platform: ExecutionPlatform = target.platform === "local-process"
      ? new LocalProcessExecutionPlatform({ observer: new WorkloadProofObserver() })
      : target.platform === "compose"
        ? createComposePlatform(target, () => workloads)
        : (() => { throw new Error("Kubernetes projects are not supported by the web API"); })();
    workloads = await platform.discover(target);
    const delayOptionsMs = [0, 500, 1000, 1500, 2000, 3000];
    const candidates = generateCandidates(workloads, delayOptionsMs).slice(0, 36);
    let testedSchedules = 0;
    const result = await discoverFailure({
      candidates,
      delayOptionsMs,
      target,
      runSchedule: async (runTarget, schedule) => {
        const runResult = await platform.run(runTarget, schedule);
        testedSchedules += 1;
        onProgress(testedSchedules, candidates.length);
        return runResult;
      },
      replaySchedule: platform.replay.bind(platform),
    });
    return toDiscoveryRunnerResult(result);
  };
}

export function toDiscoveryRunnerResult(result: DiscoveryResult): Awaited<ReturnType<DiscoveryRunner>> {
  if (result.status === "found_failure") {
    return { status: "completed", artifact: result.artifact, testedSchedules: result.testedSchedules };
  }
  if (result.status === "no_failure") return { status: "no_failure", testedSchedules: result.testedSchedules };
  return { status: result.status, testedSchedules: result.testedSchedules };
}

function createComposePlatform(target: Extract<TargetConfig, { platform: "compose" }>, workloads: () => Workload[]): ExecutionPlatform {
  const runner = new NodeCommandRunner();
  const projectDirectory = dirname(target.composeFile);
  return new ComposeExecutionPlatform({
    discovery: new DockerComposeServiceDiscovery({ projectDirectory, runner }),
    executorFor: (composeTarget, attemptId = "reset") => new DockerRuntimeController({
      compose: new DockerComposeClient({
        projectDirectory,
        composeFile: composeTarget.composeFile,
        projectName: composeProjectName(composeTarget.composeFile, attemptId),
        runner,
      }),
      delay: new SystemDelay(),
      observer: new ComposeProofObserver(workloads),
    })
  });
}

function composeProjectName(composeFile: string, attemptId: string): string {
  const digest = createHash("sha256").update(`${composeFile}\0${attemptId}`).digest("hex").slice(0, 20);
  return `dsrd-${digest}`;
}
