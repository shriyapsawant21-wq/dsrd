import type {
  FailureArtifact,
  RunResult,
  Schedule,
  TargetConfig,
  TimelineEvent
} from "@dsrd/contracts";

import { createFailureArtifact } from "./artifact.js";
import { minimizeSchedule } from "./minimize.js";
import { searchSchedules, type RunSchedule } from "./search.js";

export type DiscoverFailureOptions = {
  candidates: readonly Schedule[];
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
  const searchResult = await searchSchedules(options.candidates, options.target, options.runSchedule, {
    maxSchedules: options.maxSchedules,
  });
  if (searchResult.status === "no_failure") {
    return searchResult;
  }

  const minimizedSchedule = await minimizeSchedule(
    searchResult.failingSchedule,
    options.target,
    options.runSchedule,
    options.delayOptionsMs
  );
  const minimizedRun = await confirmFailure(
    minimizedSchedule,
    options.target,
    options.runSchedule,
  );

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

async function confirmFailure(
  schedule: Schedule,
  target: TargetConfig,
  runSchedule: RunSchedule,
): Promise<RunResult> {
  const attempts = 3;
  const requiredFailures = 2;
  let failures = 0;
  let lastFailure: RunResult | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await runSchedule(target, schedule);
    if (result.status === "fail") {
      failures += 1;
      lastFailure = result;
    }
  }

  if (lastFailure === undefined || failures < requiredFailures) {
    throw new Error(
      `Minimized schedule was unstable: failure reproduced ${failures}/${attempts} times`,
    );
  }
  return lastFailure;
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
