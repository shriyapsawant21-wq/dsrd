import type { RunResult } from "@dsrd/contracts";

import { buildTimeline } from "../timeline.js";
import type { ObservationSnapshot } from "./types.js";

export type ProofEvaluator = {
  evaluate(input: ObservationSnapshot): RunResult;
};

function failedResult(
  input: ObservationSnapshot,
  failureReason: string,
): RunResult {
  return {
    scheduleId: input.scheduleId,
    status: "fail",
    events: buildTimeline(input),
    logs: [...input.logs],
    failureReason,
  };
}

export function evaluateRun(input: ObservationSnapshot): RunResult {
  const apiHttp = input.readiness.find(
    (observation) =>
      observation.service === "api" && observation.kind === "http",
  );
  const postgresTcp = input.readiness.find(
    (observation) =>
      observation.service === "postgres" && observation.kind === "tcp",
  );
  const apiRunning = input.containers.some(
    (container) =>
      container.service === "api" && container.state === "running",
  );
  const cacheRunning = input.containers.some(
    (container) =>
      container.service === "cache" &&
      container.state === "running" &&
      container.health === "healthy",
  );
  const workerExitedZero = input.containers.some(
    (container) =>
      container.service === "worker" &&
      container.state === "exited" &&
      container.exitCode === 0,
  );

  if (
    apiHttp?.status === "ready" &&
    postgresTcp?.status === "ready" &&
    apiRunning &&
    cacheRunning &&
    workerExitedZero
  ) {
    return {
      scheduleId: input.scheduleId,
      status: "pass",
      events: buildTimeline(input),
      logs: [...input.logs],
    };
  }

  const logFailure = input.logFailures[0];
  if (logFailure !== undefined) {
    return failedResult(
      input,
      `${logFailure.summary} (${logFailure.service})`,
    );
  }

  const apiExitedNonZero = input.containers.some(
    (container) =>
      container.service === "api" &&
      container.state === "exited" &&
      container.exitCode !== undefined &&
      container.exitCode !== 0,
  );
  if (apiExitedNonZero) {
    return failedResult(
      input,
      "API exited during startup before becoming ready",
    );
  }

  if (
    apiHttp !== undefined &&
    (apiHttp.status === "timeout" || apiHttp.status === "unhealthy")
  ) {
    return failedResult(
      input,
      "API did not become ready before the startup deadline",
    );
  }

  const workerExitedNonZero = input.containers.some(
    (container) =>
      container.service === "worker" &&
      container.state === "exited" &&
      container.exitCode !== undefined &&
      container.exitCode !== 0,
  );
  if (workerExitedNonZero) {
    return failedResult(
      input,
      "Worker could not complete its startup API request",
    );
  }

  if (postgresTcp !== undefined && postgresTcp.status !== "ready") {
    return failedResult(
      input,
      "PostgreSQL did not become ready before the startup deadline",
    );
  }

  return failedResult(input, "Run ended without complete pass evidence");
}

export const deterministicProofEvaluator: ProofEvaluator = {
  evaluate: evaluateRun,
};
