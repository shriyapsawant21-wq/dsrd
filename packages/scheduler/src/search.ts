import type { RunResult, Schedule, TargetConfig, TimelineEvent } from "@dsrd/contracts";

import type { CandidateStage } from "./candidates.js";

export type RunSchedule = (target: TargetConfig, schedule: Schedule) => Promise<RunResult>;

export type SearchOptions = {
  maxSchedules?: number;
};

export type SearchResult =
  | {
      status: "found_failure";
      testedSchedules: number;
      failingSchedule: Schedule;
      failureReason?: string;
      events: TimelineEvent[];
    }
  | {
      status: "no_failure";
      testedSchedules: number;
    };

/** Runs schedules in order and trusts the proof layer's pass/fail result. */
export async function searchSchedules(
  schedules: readonly Schedule[],
  target: TargetConfig,
  runSchedule: RunSchedule,
  options: SearchOptions = {},
): Promise<SearchResult> {
  return searchCandidateStages([
    { name: "full", candidateCount: schedules.length, create: () => schedules },
  ], target, runSchedule, options);
}

export async function searchCandidateStages(
  stages: readonly CandidateStage[],
  target: TargetConfig,
  runSchedule: RunSchedule,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const seen = new Set<string>();
  let testedSchedules = 0;
  for (const stage of stages) {
    for (const schedule of stage.create()) {
      const key = scheduleKey(schedule);
      if (seen.has(key)) continue;
      if (options.maxSchedules !== undefined && testedSchedules >= options.maxSchedules) {
        return { status: "no_failure", testedSchedules };
      }
      seen.add(key);
      const result = await runSchedule(target, schedule);
      testedSchedules += 1;
      if (result.status === "fail") {
        return {
          status: "found_failure",
          testedSchedules,
          failingSchedule: schedule,
          failureReason: result.failureReason,
          events: result.events
        };
      }
    }
  }

  return { status: "no_failure", testedSchedules };
}

function scheduleKey(schedule: Schedule): string {
  return JSON.stringify([...schedule.perturbations]
    .map(({ workloadId, phase, delayMs }) => ({ workloadId, phase, delayMs }))
    .sort((left, right) =>
      `${left.workloadId}:${left.phase}:${left.delayMs}`.localeCompare(`${right.workloadId}:${right.phase}:${right.delayMs}`)
    ));
}
