import { dirname } from "node:path";
import type { ExecutionPlatform, TargetConfig, Workload } from "@dsrd/contracts";
import { ComposeProofObserver, WorkloadProofObserver } from "@dsrd/proof";
import { ComposeExecutionPlatform, DockerComposeClient, DockerComposeServiceDiscovery, DockerRuntimeController, LocalProcessExecutionPlatform, NodeCommandRunner, SystemDelay } from "@dsrd/runtime";
import { discoverFailure, generateCandidates } from "@dsrd/scheduler";
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
      }
    });
    return result.status === "found_failure" ? { status: "completed", artifact: result.artifact, testedSchedules: result.testedSchedules } : { status: "no_failure", testedSchedules: result.testedSchedules };
  };
}

function createComposePlatform(target: Extract<TargetConfig, { platform: "compose" }>, workloads: () => Workload[]): ExecutionPlatform {
  const runner = new NodeCommandRunner();
  const projectDirectory = dirname(target.composeFile);
  return new ComposeExecutionPlatform({
    discovery: new DockerComposeServiceDiscovery({ projectDirectory, runner }),
    executorFor: (composeTarget) => new DockerRuntimeController({ compose: new DockerComposeClient({ projectDirectory, composeFile: composeTarget.composeFile, runner }), delay: new SystemDelay(), observer: new ComposeProofObserver(workloads) })
  });
}
