import type { RunResult, Workload } from "@dsrd/contracts";
import { buildWorkloadTimeline } from "../timeline.js";
import type { WorkloadObservationSnapshot } from "./types.js";

export type ProofEvaluator = {
  evaluate(input: WorkloadObservationSnapshot): RunResult;
};

function failedResult(input: WorkloadObservationSnapshot, failureReason: string): RunResult {
  return {
    scheduleId: input.scheduleId,
    status: "fail",
    events: buildWorkloadTimeline(input),
    logs: [...input.logs],
    failureReason,
  };
}

function stateSatisfies(workload: Workload, input: WorkloadObservationSnapshot) {
  const state = input.states.find(({ workload: id }) => id === workload.id);
  if (state === undefined) return false;
  if (workload.kind === "job" || workload.kind === "initializer") {
    return state.state === "exited" && state.exitCode === 0;
  }
  return state.state === "running" && state.health !== "unhealthy";
}

function readinessSatisfies(workload: Workload, input: WorkloadObservationSnapshot) {
  if (workload.readiness === undefined) return true;
  return input.readiness.some(
    ({ workload: id, kind, status }) =>
      id === workload.id && kind === workload.readiness?.type && status === "ready",
  );
}

export function evaluateWorkloadRun(input: WorkloadObservationSnapshot): RunResult {
  if (input.workloads.length === 0) {
    throw new Error("Cannot evaluate proof without workloads");
  }
  const completePass = input.workloads.every(
    (workload) => stateSatisfies(workload, input) && readinessSatisfies(workload, input),
  );
  if (completePass) {
    return {
      scheduleId: input.scheduleId,
      status: "pass",
      events: buildWorkloadTimeline(input),
      logs: [...input.logs],
    };
  }

  const logFailure = input.logFailures[0];
  if (logFailure !== undefined) {
    return failedResult(input, `${logFailure.summary} (${logFailure.workload})`);
  }
  const nonZeroExit = input.states.find(
    ({ state, exitCode }) => state === "exited" && exitCode !== undefined && exitCode !== 0,
  );
  if (nonZeroExit !== undefined) {
    return failedResult(input, `${nonZeroExit.workload} exited with code ${nonZeroExit.exitCode}`);
  }
  const failedReadiness = input.readiness.find(({ status }) => status !== "ready");
  if (failedReadiness !== undefined) {
    return failedResult(
      input,
      `${failedReadiness.workload} ${failedReadiness.kind} readiness ${failedReadiness.status}`,
    );
  }
  return failedResult(input, "Run ended without complete pass evidence");
}

export const deterministicProofEvaluator: ProofEvaluator = { evaluate: evaluateWorkloadRun };
