import type { FailureSignature, RunResult, Workload } from "@dsrd/contracts";
import { buildWorkloadTimeline } from "../timeline.js";
import type { WorkloadObservationSnapshot } from "./types.js";

export type ProofEvaluator = {
  evaluate(input: WorkloadObservationSnapshot): RunResult;
};

function failedResult(
  input: WorkloadObservationSnapshot,
  failureReason: string,
  failureSignature: FailureSignature,
): RunResult {
  return {
    scheduleId: input.scheduleId,
    status: "workload_failure",
    events: buildWorkloadTimeline(input),
    logs: [...input.logs],
    failureReason,
    failureSignature,
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

const structuredFailureEvents = new Set([
  "api_request_failed",
  "db_connection_failed",
  "dependency_not_ready",
  "job_failed",
  "startup_failed",
]);

function structuredFailure(input: WorkloadObservationSnapshot): { reason: string; signature: FailureSignature } | undefined {
  const event = input.workloadEvents.find(({ event }) => structuredFailureEvents.has(event));
  if (event === undefined) return undefined;

  const parsedLog = input.logFailures.find(({ workload }) => workload === event.workload);
  return {
    reason: parsedLog === undefined
      ? `${event.workload} reported ${event.event}`
      : `${parsedLog.summary} (${event.workload})`,
    signature: {
      workloadId: event.workload,
      assertionId: `structured:${event.event}`,
      category: "structured_failure",
      code: event.event,
    },
  };
}

export function evaluateWorkloadRun(input: WorkloadObservationSnapshot): RunResult {
  if (input.workloads.length === 0) {
    throw new Error("Cannot evaluate proof without workloads");
  }
  const structured = structuredFailure(input);
  if (structured !== undefined) return failedResult(input, structured.reason, structured.signature);

  const nonZeroExit = input.states.find(
    ({ state, exitCode }) => state === "exited" && exitCode !== undefined && exitCode !== 0,
  );
  if (nonZeroExit !== undefined) {
    return failedResult(input, `${nonZeroExit.workload} exited with code ${nonZeroExit.exitCode}`, {
      workloadId: nonZeroExit.workload,
      assertionId: "process-exit",
      category: "unexpected_exit",
      code: String(nonZeroExit.exitCode),
    });
  }
  const failedReadiness = input.readiness.find(({ status }) => status !== "ready");
  if (failedReadiness !== undefined) {
    return failedResult(
      input,
      `${failedReadiness.workload} ${failedReadiness.kind} readiness ${failedReadiness.status}`,
      {
        workloadId: failedReadiness.workload,
        assertionId: `${failedReadiness.kind}-readiness`,
        category: "readiness_failed",
        code: failedReadiness.status,
      },
    );
  }
  const completePass = input.workloads.every(
    (workload) => stateSatisfies(workload, input) && readinessSatisfies(workload, input),
  );
  if (completePass) {
    return {
      scheduleId: input.scheduleId,
      status: "healthy",
      events: buildWorkloadTimeline(input),
      logs: [...input.logs],
    };
  }

  return {
    scheduleId: input.scheduleId,
    status: "inconclusive",
    events: buildWorkloadTimeline(input),
    logs: [...input.logs],
    diagnostics: [{
      code: "incomplete_proof_evidence",
      message: "Run ended without complete healthy evidence or machine-verifiable failure evidence",
    }],
  };
}

export const deterministicProofEvaluator: ProofEvaluator = { evaluate: evaluateWorkloadRun };
