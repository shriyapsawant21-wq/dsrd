import type { RunResult, Schedule, TargetConfig, TimelineEvent } from "@dsrd/contracts";

export type RunSchedule = (target: TargetConfig, schedule: Schedule) => Promise<RunResult>;

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
  options: { maxSchedules?: number } = {},
): Promise<SearchResult> {
  const candidates = options.maxSchedules === undefined
    ? schedules
    : schedules.slice(0, options.maxSchedules);
  for (const [index, schedule] of candidates.entries()) {
    const result = await runSchedule(target, schedule);
    if (result.status === "fail") {
      return {
        status: "found_failure",
        testedSchedules: index + 1,
        failingSchedule: schedule,
        failureReason: result.failureReason,
        events: result.events
      };
    }
  }

  return { status: "no_failure", testedSchedules: candidates.length };
}
