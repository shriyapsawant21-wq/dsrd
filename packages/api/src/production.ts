import { dirname } from "node:path";
import type { Workload } from "@dsrd/contracts";
import { ComposeProofObserver } from "@dsrd/proof";
import { ComposeExecutionPlatform, DockerComposeClient, DockerComposeServiceDiscovery, DockerRuntimeController, NodeCommandRunner, SystemDelay } from "@dsrd/runtime";
import { discoverFailure, generateCandidates } from "@dsrd/scheduler";
import type { DiscoveryRunner } from "./run-service.js";

export function createProductionDiscoveryRunner(): DiscoveryRunner {
  return async (composeFile, onProgress) => {
    const runner = new NodeCommandRunner();
    const projectDirectory = dirname(composeFile);
    let workloads: Workload[] = [];
    const platform = new ComposeExecutionPlatform({
      discovery: new DockerComposeServiceDiscovery({ projectDirectory, runner }),
      executorFor: (target) => new DockerRuntimeController({ compose: new DockerComposeClient({ projectDirectory, composeFile: target.composeFile, runner }), delay: new SystemDelay(), observer: new ComposeProofObserver(() => workloads) })
    });
    const target = { platform: "compose" as const, composeFile };
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
      }
    });
    return result.status === "found_failure" ? { status: "completed", artifact: result.artifact, testedSchedules: result.testedSchedules } : { status: "no_failure", testedSchedules: result.testedSchedules };
  };
}
