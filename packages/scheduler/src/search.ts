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
  runSchedule: RunSchedule
): Promise<SearchResult> {
  for (const [index, schedule] of schedules.entries()) {
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

  return { status: "no_failure", testedSchedules: schedules.length };
}
