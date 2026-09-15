import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { searchSchedules, searchCandidateStages } from "./search.js";

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
      return runResult(schedule.id, schedule.id === "schedule-001" ? "workload_failure" : "healthy");
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
      runResult(schedule.id, "healthy")
    );

    expect(result).toEqual({ status: "no_failure", testedSchedules: 3 });
  });

  it.each(["execution_error", "inconclusive", "cancelled"] as const)("preserves a %s physical terminal result instead of reporting no failure", async (status) => {
    const result = await searchSchedules(schedules, target, async (_target, schedule) =>
      runResult(schedule.id, schedule.id === "schedule-001" ? status : "healthy")
    );

    expect(result).toMatchObject({ status, testedSchedules: 2 });
  });
});

describe("searchCandidateStages", () => {
  it("searches isolated candidates before pairwise and lazily reaches full fallback", async () => {
    const executed: string[] = [];
    let fullCreated = false;
    const stages = [
      { name: "isolated", candidateCount: 1, create: () => [{ id: "baseline", perturbations: [] }] },
      { name: "pairwise", candidateCount: 1, create: () => [{ id: "pair", perturbations: [{ workloadId: "api", phase: "start", delayMs: 1 }] }] },
      { name: "full", candidateCount: 1, create: () => { fullCreated = true; return [{ id: "full", perturbations: [] }]; } },
    ];

    const result = await searchCandidateStages(stages, target, async (_target, schedule) => {
      executed.push(schedule.id);
      return runResult(schedule.id, schedule.id === "pair" ? "workload_failure" : "healthy");
    });

    expect(executed).toEqual(["baseline", "pair"]);
    expect(fullCreated).toBe(false);
    expect(result).toMatchObject({ status: "found_failure", testedSchedules: 2 });
  });

  it("enforces a maximum number of physical schedule executions", async () => {
    const executed: string[] = [];
    const result = await searchCandidateStages([
      { name: "isolated", candidateCount: 3, create: () => schedules },
      { name: "pairwise", candidateCount: 0, create: () => [] },
      { name: "full", candidateCount: 0, create: () => [] },
    ], target, async (_target, schedule) => {
      executed.push(schedule.id);
      return runResult(schedule.id, "healthy");
    }, { maxSchedules: 2 });

    expect(executed).toEqual(["schedule-000", "schedule-001"]);
    expect(result).toEqual({ status: "no_failure", testedSchedules: 2 });
  });
});

function runResult(scheduleId: string, status: RunResult["status"]): RunResult {
  return {
    scheduleId,
    status,
    events: [],
    logs: [],
    ...(status === "workload_failure" ? { failureReason: "bootstrap unavailable" } : {})
  };
}
