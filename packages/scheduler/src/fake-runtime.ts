import type { RunResult, Schedule } from "@dsrd/contracts";

import type { RunSchedule } from "./search.js";

/**
 * Temporary deterministic runner for scheduler development.
 * Replace this injection point with Riya's RuntimeController.runSchedule.
 */
export const fakeRunSchedule: RunSchedule = async (schedule: Schedule): Promise<RunResult> => {
  const readinessDelayMs = schedule.services.postgres?.readinessDelayMs ?? 0;
  const failed = readinessDelayMs >= 1000;

  return {
    scheduleId: schedule.id,
    status: failed ? "fail" : "pass",
    events: failed
      ? [
          {
            timeMs: 1000,
            service: "api",
            event: "startup_failed",
            detail: "fake runtime: database was not ready"
          }
        ]
      : [],
    logs: [],
    ...(failed ? { failureReason: "fake runtime: database unavailable" } : {})
  };
};
