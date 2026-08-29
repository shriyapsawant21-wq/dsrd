import type { FailureArtifact, RunResult, Schedule, TargetConfig } from "@dsrd/contracts";

import { createFailureArtifact } from "./artifact.js";
import { minimizeSchedule } from "./minimize.js";
import { searchSchedules, type RunSchedule } from "./search.js";

export type DiscoverFailureOptions = {
  candidates: readonly Schedule[];
  delayOptionsMs: readonly number[];
  target: TargetConfig;
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
  const searchResult = await searchSchedules(options.candidates, options.target, options.runSchedule);
  if (searchResult.status === "no_failure") {
    return searchResult;
  }

  const minimizedSchedule = await minimizeSchedule(
    searchResult.failingSchedule,
    options.target,
    options.runSchedule,
    options.delayOptionsMs
  );
  const minimizedRun = await options.runSchedule(options.target, minimizedSchedule);
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

  return {
    status: result.status === "fail" && reasonMatches ? "reproduced" : "not_reproduced",
    result
  };
}
