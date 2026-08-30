import type { FailureDetail, FailureSummary } from "./api";

const demoFailure: FailureSummary = {
  id: "failure-1",
  name: "DB_CONNECTION_FAILED",
  severity: "critical",
  reason: "postgres was not ready before the api check"
};

export function getReportFailures(failures?: FailureSummary[]): FailureSummary[] {
  return failures?.length ? failures : [demoFailure];
}

export function getDemoFailureDetail(): FailureDetail {
  return {
    ...demoFailure,
    originalSchedule: { id: "schedule-1", perturbations: [{ service: "postgres", delayMs: 2000 }] },
    minimizedSchedule: { id: "minimized-1", perturbations: [{ service: "postgres", delayMs: 2000 }] },
    events: [
      { timeMs: 0, service: "postgres", event: "scheduled_start", detail: "2000ms startup delay" },
      { timeMs: 5442, service: "api", event: "db_connection_attempt", detail: "connecting to postgres" },
      { timeMs: 5445, service: "api", event: "db_connection_failed", detail: demoFailure.reason }
    ]
  };
}
