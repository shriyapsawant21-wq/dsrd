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
  baselineRuns?: number;
  confirmationRuns?: number;
};

export type DiscoveryResult =
  | {
      status: "found_failure";
      testedSchedules: number;
      exploredCandidateSchedules: number;
      artifact: FailureArtifact;
    }
  | {
      status: "no_failure";
      testedSchedules: number;
      exploredCandidateSchedules: number;
    }
  | {
      status: "target_unhealthy" | "execution_error" | "inconclusive";
      testedSchedules: number;
      exploredCandidateSchedules: number;
      diagnostics?: RunResult["diagnostics"];
    };

export type ReplayResult = {
  status: "reproduced" | "not_reproduced";
  result: RunResult;
};

class ExecutionBudgetExhausted extends Error {}

export async function discoverFailure(
  options: DiscoverFailureOptions
): Promise<DiscoveryResult> {
  let executions = 0;
  const runSchedule = async (target: TargetConfig, schedule: Schedule): Promise<RunResult> => {
    if (options.maxSchedules !== undefined && executions >= options.maxSchedules) {
      throw new ExecutionBudgetExhausted("Maximum schedule execution budget exhausted");
    }
    executions += 1;
    return options.runSchedule(target, schedule);
  };
  const baseline: Schedule = { id: "baseline", perturbations: [] };
  const baselineRuns = options.baselineRuns ?? 3;
  const confirmationRuns = options.confirmationRuns ?? 3;
  if (!Number.isInteger(baselineRuns) || baselineRuns < 1) {
    throw new RangeError("baselineRuns must be a positive integer");
  }
  if (!Number.isInteger(confirmationRuns) || confirmationRuns < 1) {
    throw new RangeError("confirmationRuns must be a positive integer");
  }
  let exploredCandidateSchedules = 0;
  try {
  let baselineResult: RunResult | undefined;
  for (let run = 0; run < baselineRuns; run += 1) {
    baselineResult = await runSchedule(options.target, baseline);
    if (baselineResult.status !== "healthy") break;
  }
  const baselineEvidence = baselineResult ?? {
    scheduleId: baseline.id,
    status: "inconclusive" as const,
    events: [],
    logs: [],
  };
  if (baselineEvidence.status !== "healthy") {
    return {
      status: baselineEvidence.status === "workload_failure"
        ? "target_unhealthy"
        : baselineEvidence.status === "execution_error"
          ? "execution_error"
          : "inconclusive",
      testedSchedules: executions,
      exploredCandidateSchedules: 0,
      ...(baselineEvidence.diagnostics === undefined ? {} : { diagnostics: baselineEvidence.diagnostics }),
    };
  }
  const searchOptions: SearchOptions = { maxSchedules: options.maxSchedules };
  const searchResult = options.candidateStages !== undefined
    ? await searchCandidateStages(options.candidateStages, options.target, runSchedule, searchOptions)
    : await searchSchedules(
      (options.candidates ?? []).filter((candidate) => candidate.perturbations.length > 0),
      options.target,
      runSchedule,
      searchOptions,
    );
  exploredCandidateSchedules = searchResult.testedSchedules;
  if (searchResult.status === "no_failure") {
    return { ...searchResult, testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };
  }

  const confirmation = await confirmFailure(
    options.target,
    searchResult.failingSchedule,
    searchResult.failureReason,
    searchResult.failureSignature,
    confirmationRuns - 1,
    runSchedule,
  );
  if (!confirmation) return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };

  const runReproducibly: RunSchedule = async (target, schedule) => {
    const first = await runSchedule(target, schedule);
    if (first.status !== "workload_failure") return first;
    return runSchedule(target, schedule);
  };
  const minimizedSchedule = await minimizeSchedule(
    searchResult.failingSchedule,
    options.target,
    runReproducibly,
    options.delayOptionsMs
  );
  const minimizedRun = await runReproducibly(options.target, minimizedSchedule);
  if (minimizedRun.status !== "workload_failure") {
    return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };
  }

  return {
    status: "found_failure",
    testedSchedules: executions,
    exploredCandidateSchedules: searchResult.testedSchedules,
    artifact: createFailureArtifact({
      createdAt: options.createdAt ?? new Date().toISOString(),
      target: options.target,
      originalSchedule: searchResult.failingSchedule,
      minimizedSchedule,
      expectedFailureReason: minimizedRun.failureReason,
      events: minimizedRun.events
    })
  };
  } catch (error) {
    if (error instanceof ExecutionBudgetExhausted) {
      return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules };
    }
    throw error;
  }
}

async function confirmFailure(
  target: TargetConfig,
  schedule: Schedule,
  expectedReason: string | undefined,
  expectedSignature: RunResult["failureSignature"],
  repeats: number,
  runSchedule: RunSchedule,
): Promise<boolean> {
  for (let run = 0; run < repeats; run += 1) {
    const result = await runSchedule(target, schedule);
    if (
      result.status !== "workload_failure" ||
      result.failureReason !== expectedReason ||
      (expectedSignature !== undefined && !sameSignature(expectedSignature, result.failureSignature))
    ) return false;
  }
  return true;
}

function sameSignature(
  expected: NonNullable<RunResult["failureSignature"]>,
  actual: RunResult["failureSignature"],
): boolean {
  return actual !== undefined &&
    expected.workloadId === actual.workloadId &&
    expected.assertionId === actual.assertionId &&
    expected.category === actual.category &&
    expected.code === actual.code;
}

export async function replayFailure(
  artifact: FailureArtifact,
  replaySchedule: RunSchedule
): Promise<ReplayResult> {
  const result = await replaySchedule(artifact.target, artifact.minimizedSchedule);
  const reasonMatches =
    artifact.expectedFailureReason === undefined ||
    artifact.expectedFailureReason === result.failureReason;
  const evidenceMatches = hasOrderedEvidence(artifact.events, result.events);

  return {
    status:
      result.status === "workload_failure" && reasonMatches && evidenceMatches
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

function hasOrderedEvidence(
  expectedEvents: readonly TimelineEvent[],
  actualEvents: readonly TimelineEvent[],
): boolean {
  let actualIndex = 0;
  for (const expected of expectedEvents) {
    while (actualIndex < actualEvents.length && !sameEvidence(expected, actualEvents[actualIndex]!)) {
      actualIndex += 1;
    }
    if (actualIndex === actualEvents.length) return false;
    actualIndex += 1;
  }
  return true;
}
