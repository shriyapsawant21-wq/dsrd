import type { FailureArtifact, RunResult, Schedule } from "@dsrd/contracts";

import { createFailureArtifact } from "./artifact.js";
import { minimizeSchedule } from "./minimize.js";
import { searchSchedules, type RunSchedule } from "./search.js";

export type DiscoverFailureOptions = {
  candidates: readonly Schedule[];
  delayOptionsMs: readonly number[];
  createdAt?: string;
  runSchedule: RunSchedule;
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
  const searchResult = await searchSchedules(options.candidates, options.runSchedule);
  if (searchResult.status === "no_failure") {
    return searchResult;
  }

  const minimizedSchedule = await minimizeSchedule(
    searchResult.failingSchedule,
    options.runSchedule,
    options.delayOptionsMs
  );
  const minimizedRun = await options.runSchedule(minimizedSchedule);
  if (minimizedRun.status !== "fail") {
    throw new Error("Minimization produced a schedule that did not reproduce the failure");
  }

  return {
    status: "found_failure",
    testedSchedules: searchResult.testedSchedules,
    artifact: createFailureArtifact({
      createdAt: options.createdAt ?? new Date().toISOString(),
      originalSchedule: searchResult.failingSchedule,
      minimizedSchedule,
      expectedFailureReason: minimizedRun.failureReason,
      events: minimizedRun.events
    })
  };
}

export async function replayFailure(
  artifact: FailureArtifact,
  runSchedule: RunSchedule
): Promise<ReplayResult> {
  const result = await runSchedule(artifact.minimizedSchedule);
  const reasonMatches =
    artifact.expectedFailureReason === undefined ||
    artifact.expectedFailureReason === result.failureReason;

  return {
    status: result.status === "fail" && reasonMatches ? "reproduced" : "not_reproduced",
    result
  };
}
