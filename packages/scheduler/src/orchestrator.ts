import type {
  FailureArtifact,
  RunResult,
  Schedule,
  TargetConfig,
  TimelineEvent
} from "@dsrd/contracts";

import { createFailureArtifact } from "./artifact.js";
import type { CandidateStage } from "./candidates.js";
import { minimizeSchedule } from "./minimize.js";
import { searchCandidateStages, searchSchedules, type RunSchedule, type SearchOptions } from "./search.js";

export type DiscoverFailureOptions = {
  candidates?: readonly Schedule[];
  candidateStages?: readonly CandidateStage[];
  delayOptionsMs: readonly number[];
  target: TargetConfig;
  createdAt?: string;
  runSchedule: RunSchedule;
  maxSchedules?: number;
};

export type DiscoveryResult =
  | {
      status: "found_failure";
      testedSchedules: number;
      artifact: FailureArtifact;
    }
  | {
      status: "no_failure";
      testedSchedules: number;
    };

export type ReplayResult = {
  status: "reproduced" | "not_reproduced";
  result: RunResult;
};

export async function discoverFailure(
  options: DiscoverFailureOptions
): Promise<DiscoveryResult> {
  let executions = 0;
  const runSchedule = async (target: TargetConfig, schedule: Schedule): Promise<RunResult> => {
    if (options.maxSchedules !== undefined && executions >= options.maxSchedules) {
      throw new Error("Maximum schedule execution budget exhausted");
    }
    executions += 1;
    return options.runSchedule(target, schedule);
  };
  const searchOptions: SearchOptions = { maxSchedules: options.maxSchedules };
  const searchResult = options.candidateStages !== undefined
    ? await searchCandidateStages(options.candidateStages, options.target, runSchedule, searchOptions)
    : await searchSchedules(options.candidates ?? [], options.target, runSchedule, searchOptions);
  if (searchResult.status === "no_failure") {
    return searchResult;
  }

  const minimizedSchedule = await minimizeSchedule(
    searchResult.failingSchedule,
    options.target,
    runSchedule,
    options.delayOptionsMs
  );
  const minimizedRun = await runSchedule(options.target, minimizedSchedule);
  if (minimizedRun.status !== "fail") {
    throw new Error("Minimization produced a schedule that did not reproduce the failure");
  }

  return {
    status: "found_failure",
    testedSchedules: searchResult.testedSchedules,
    artifact: createFailureArtifact({
      createdAt: options.createdAt ?? new Date().toISOString(),
      target: options.target,
      originalSchedule: searchResult.failingSchedule,
      minimizedSchedule,
      expectedFailureReason: minimizedRun.failureReason,
      events: minimizedRun.events
    })
  };
}

export async function replayFailure(
  artifact: FailureArtifact,
  replaySchedule: RunSchedule
): Promise<ReplayResult> {
  const result = await replaySchedule(artifact.target, artifact.minimizedSchedule);
  const reasonMatches =
    artifact.expectedFailureReason === undefined ||
    artifact.expectedFailureReason === result.failureReason;
  const evidenceMatches = artifact.events.every((expected) =>
    result.events.some((actual) => sameEvidence(expected, actual))
  );

  return {
    status:
      result.status === "fail" && reasonMatches && evidenceMatches
        ? "reproduced"
        : "not_reproduced",
    result
  };
}

function sameEvidence(expected: TimelineEvent, actual: TimelineEvent): boolean {
  return (
    expected.service === actual.service &&
    expected.event === actual.event
  );
}
