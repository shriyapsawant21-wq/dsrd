import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { searchSchedules } from "./search.js";

const schedules: Schedule[] = [
  { id: "schedule-000", perturbations: [] },
  { id: "schedule-001", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 500 }] },
  { id: "schedule-002", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }
];

const target = { platform: "local-process" as const, manifestPath: "race.json" };

describe("searchSchedules", () => {
  it("stops at the first failure classified by the supplied runner", async () => {
    const executed: string[] = [];
    const result = await searchSchedules(schedules, target, async (runTarget, schedule) => {
      expect(runTarget).toEqual(target);
      executed.push(schedule.id);
      return runResult(schedule.id, schedule.id === "schedule-001" ? "fail" : "pass");
    });

    expect(executed).toEqual(["schedule-000", "schedule-001"]);
    expect(result).toMatchObject({
      status: "found_failure",
      testedSchedules: 2,
      failingSchedule: schedules[1],
      failureReason: "bootstrap unavailable"
    });
  });

  it("reports no failure after exhausting candidates", async () => {
    const result = await searchSchedules(schedules, target, async (_target, schedule) =>
      runResult(schedule.id, "pass")
    );

    expect(result).toEqual({ status: "no_failure", testedSchedules: 3 });
  });
});

function runResult(scheduleId: string, status: RunResult["status"]): RunResult {
  return {
    scheduleId,
    status,
    events: [],
    logs: [],
    ...(status === "fail" ? { failureReason: "bootstrap unavailable" } : {})
  };
}
