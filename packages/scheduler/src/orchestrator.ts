import type {
  FailureArtifact,
  FailureArtifactV3,
  RunResult,
  Schedule,
  TargetConfig,
  TimelineEvent
} from "@dsrd/contracts";

import { createFailureArtifact, createVerifiedFailureArtifact } from "./artifact.js";
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
  replaySchedule?: RunSchedule;
  maxSchedules?: number;
  baselineRuns?: number;
  confirmationRuns?: number;
  artifactV3?: Omit<FailureArtifactV3, "version" | "createdAt" | "target" | "originalSchedule" | "minimizedSchedule" | "expectedFailureReason" | "events" | "signature" | "orderingConstraints"> & Partial<Pick<FailureArtifactV3, "orderingConstraints">>;
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
      status: "target_unhealthy" | "needs_configuration" | "execution_error" | "inconclusive";
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
      status: terminalStatus(baselineEvidence),
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

  if (options.artifactV3 !== undefined && searchResult.failureSignature === undefined) {
    return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };
  }

  const runReproducibly: RunSchedule = async (target, schedule) => {
    const first = await runSchedule(target, schedule);
    if (!matchesFailure(first, searchResult.failureReason, searchResult.failureSignature)) return first;
    const second = await runSchedule(target, schedule);
    return matchesFailure(second, searchResult.failureReason, searchResult.failureSignature)
      ? second
      : { ...second, status: "inconclusive" };
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

  if (options.artifactV3 !== undefined && !await confirmFailure(
    options.target,
    minimizedSchedule,
    searchResult.failureReason,
    searchResult.failureSignature,
    confirmationRuns,
    runSchedule,
  )) {
    return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };
  }

  if (options.artifactV3 !== undefined && options.replaySchedule === undefined) {
    return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };
  }
  const artifact: FailureArtifact = options.artifactV3 === undefined
    ? createFailureArtifact({
      createdAt: options.createdAt ?? new Date().toISOString(),
      target: options.target,
      originalSchedule: searchResult.failingSchedule,
      minimizedSchedule,
      expectedFailureReason: minimizedRun.failureReason,
      events: minimizedRun.events,
    })
    : createVerifiedFailureArtifact({
      ...options.artifactV3,
      signature: searchResult.failureSignature!,
      orderingConstraints: options.artifactV3.orderingConstraints ?? orderingConstraints(minimizedRun.events),
      createdAt: options.createdAt ?? new Date().toISOString(),
      target: options.target,
      originalSchedule: searchResult.failingSchedule,
      minimizedSchedule,
      expectedFailureReason: minimizedRun.failureReason,
      events: minimizedRun.events,
    });
  if (options.replaySchedule !== undefined) {
    const replayRuns = artifact.version === 3 ? artifact.verification.replayRuns : 1;
    for (let run = 0; run < replayRuns; run += 1) {
      const replay = await replayFailure(artifact, options.replaySchedule);
      if (replay.status !== "reproduced") {
        return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules: searchResult.testedSchedules };
      }
    }
  }

  return {
    status: "found_failure",
    testedSchedules: executions,
    exploredCandidateSchedules: searchResult.testedSchedules,
    artifact,
  };
  } catch (error) {
    if (error instanceof ExecutionBudgetExhausted) {
      return { status: "inconclusive", testedSchedules: executions, exploredCandidateSchedules };
    }
    throw error;
  }
}

function terminalStatus(result: RunResult): "target_unhealthy" | "needs_configuration" | "execution_error" | "inconclusive" {
  if (result.status === "workload_failure") return "target_unhealthy";
  if (result.diagnostics?.some(({ code }) => code === "local_process_reset_required")) return "needs_configuration";
  if (result.status === "execution_error") return "execution_error";
  return "inconclusive";
}

function orderingConstraints(events: readonly TimelineEvent[]): FailureArtifactV3["orderingConstraints"] {
  const first = events[0] ?? { service: "unknown", event: "failure" };
  const last = events.at(-1) ?? first;
  return [{
    before: { workloadId: first.service, event: first.event, occurrence: 0 },
    after: { workloadId: last.service, event: last.event, occurrence: 0 },
  }];
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

function matchesFailure(
  result: RunResult,
  expectedReason: string | undefined,
  expectedSignature: RunResult["failureSignature"],
): boolean {
  return result.status === "workload_failure" &&
    result.failureReason === expectedReason &&
    (expectedSignature === undefined || sameSignature(expectedSignature, result.failureSignature));
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
  const signatureMatches = artifact.version !== 3 || sameSignature(artifact.signature, result.failureSignature);

  return {
    status:
      result.status === "workload_failure" && reasonMatches && evidenceMatches && signatureMatches
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
