import { createHash } from "node:crypto";
import { access, constants } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ExecutionPlatform, FailureArtifactV3, RepositoryInput, RunDiagnostic, Schedule, TargetCandidate, TargetConfig } from "@dsrd/contracts";
import { defaultExperimentPolicy } from "@dsrd/contracts";
import { disposeRepository, inspectRepository, loadProjectConfig, resolveRepository, selectTarget, snapshotRepository, type RepositoryWorkspace } from "@dsrd/discovery";

import { generateCandidates, type CandidateStage } from "./candidates.js";
import { discoverFailure, replayFailure, type DiscoveryResult, type ReplayResult } from "./orchestrator.js";
import type { RunSchedule } from "./search.js";

export type OnboardingOutcome = DiscoveryResult | {
  status: "needs_configuration" | "unsupported_target" | "execution_error" | "cancelled";
  testedSchedules: number;
  exploredCandidateSchedules: number;
  diagnostics: RunDiagnostic[];
};

export type OnboardingRequest = {
  repository: RepositoryInput;
  targetId?: string;
  configPath?: string;
};

export type OnboardingService = {
  inspect(request: Pick<OnboardingRequest, "repository">): Promise<Awaited<ReturnType<typeof inspectRepository>>>;
  prepare(request: OnboardingRequest): Promise<PreparedOnboarding | OnboardingOutcome>;
  search(request: OnboardingRequest): Promise<OnboardingOutcome>;
  replay(artifact: FailureArtifactV3): Promise<ReplayResult>;
};

export type SharedDiscoveryOptions = {
  platform: ExecutionPlatform;
  target: TargetConfig;
  delayOptionsMs: readonly number[];
  baselineRuns?: number;
  confirmationRuns?: number;
  maxSchedules?: number;
  candidates?: readonly Schedule[];
  candidateStages?: readonly CandidateStage[];
  runSchedule?: RunSchedule;
  replaySchedule?: RunSchedule;
};

/** The single direct-target search path used by public CLI/API adapters. */
export async function runSharedDiscovery(options: SharedDiscoveryOptions): Promise<DiscoveryResult> {
  const workloads = await options.platform.discover(options.target);
  return discoverFailure({
    candidates: options.candidates ?? generateCandidates(workloads, options.delayOptionsMs),
    candidateStages: options.candidateStages,
    delayOptionsMs: options.delayOptionsMs,
    target: options.target,
    runSchedule: options.runSchedule ?? options.platform.run.bind(options.platform),
    replaySchedule: options.replaySchedule ?? options.platform.replay.bind(options.platform),
    maxSchedules: options.maxSchedules,
    baselineRuns: options.baselineRuns,
    confirmationRuns: options.confirmationRuns,
  });
}

type PreparedOnboarding = {
  workspace: RepositoryWorkspace;
  snapshot: FailureArtifactV3["repository"];
  candidate: TargetCandidate;
  target: TargetConfig;
  config: Awaited<ReturnType<typeof loadProjectConfig>>;
};

export function createOnboardingService(options: { platform: ExecutionPlatform; signal?: AbortSignal }): OnboardingService {
  const signal = options.signal ?? new AbortController().signal;
  const acquire = async (request: Pick<OnboardingRequest, "repository">) => resolveRepository(request.repository, { signal, acquisitionMs: defaultExperimentPolicy.timeouts.acquisitionMs });
  return {
    async inspect(request) {
      const workspace = await acquire(request);
      try { return await inspectRepository(workspace.root); }
      finally { await disposeRepository(workspace); }
    },
    async prepare(request) {
      const workspace = await acquire(request);
      try {
        const inspection = await inspectRepository(workspace.root);
        const configPath = resolve(workspace.root, request.configPath ?? "dsrd.yaml");
        if (!await exists(configPath)) {
          await disposeRepository(workspace);
          return configurationRequired("dsrd.yaml is required before execution");
        }
        const config = await loadProjectConfig(configPath);
        const selection = selectTarget(inspection, { targetId: request.targetId, config });
        if (selection.status !== "selected") {
          await disposeRepository(workspace);
          return { ...selection, testedSchedules: 0, exploredCandidateSchedules: 0 };
        }
        if (selection.candidate.adapter !== config.target.adapter) {
          await disposeRepository(workspace);
          return configurationRequired("selected target adapter differs from dsrd.yaml");
        }
        const target = toTargetConfig(workspace.root, selection.candidate);
        const snapshot = await snapshotRepository(workspace, [...selection.candidate.launchFiles, request.configPath ?? "dsrd.yaml"]);
        return {
          workspace,
          snapshot: { snapshotId: snapshot.id, contentDigest: snapshot.contentDigest, ...(snapshot.origin === undefined ? {} : { origin: snapshot.origin }), ...(snapshot.resolvedRevision === undefined ? {} : { resolvedRevision: snapshot.resolvedRevision }) },
          candidate: selection.candidate,
          target,
          config,
        };
      } catch (error) {
        await disposeRepository(workspace);
        return executionError(error);
      }
    },
    async search(request) {
      const prepared = await this.prepare(request);
      if ("status" in prepared) return prepared;
      try {
        if (prepared.candidate.adapter === "kubernetes") return unsupported("Kubernetes onboarding execution is not enabled");
        const workloads = await options.platform.discover(prepared.target);
        const candidates = generateCandidates(workloads, prepared.config.experiment.delayOptionsMs);
        const artifactV3 = verifiedContext(prepared, workloads);
        return await discoverFailure({
          candidates,
          delayOptionsMs: prepared.config.experiment.delayOptionsMs,
          target: prepared.target,
          runSchedule: options.platform.run.bind(options.platform),
          replaySchedule: options.platform.replay.bind(options.platform),
          maxSchedules: prepared.config.experiment.maxExecutions,
          baselineRuns: prepared.config.experiment.baselineRuns,
          confirmationRuns: prepared.config.experiment.confirmationRuns,
          artifactV3,
        });
      } catch (error) { return executionError(error); }
      finally { await disposeRepository(prepared.workspace); }
    },
    replay: (artifact) => replayFailure(artifact, options.platform.replay.bind(options.platform)),
  };
}

function verifiedContext(prepared: PreparedOnboarding, workloads: unknown[]): Omit<FailureArtifactV3, "version" | "createdAt" | "target" | "originalSchedule" | "minimizedSchedule" | "expectedFailureReason" | "events" | "signature" | "orderingConstraints"> {
  const policy = prepared.config.experiment;
  return {
    repository: prepared.snapshot,
    selectedTarget: { ...prepared.candidate, root: prepared.candidate.root },
    configDigest: digest(prepared.config),
    modelDigest: digest(workloads),
    environmentDigest: digest({ adapter: prepared.candidate.adapter }),
    requiredBindings: Object.entries(prepared.config.bindings).filter(([, value]) => value.required).map(([id]) => id).sort(),
    policy,
    verification: { baselineRuns: policy.baselineRuns, confirmationRuns: policy.confirmationRuns, replayRuns: policy.replayRuns },
  };
}

function toTargetConfig(root: string, candidate: TargetCandidate): TargetConfig {
  const path = resolve(root, candidate.launchFiles[0]!);
  if (candidate.adapter === "compose") return { platform: "compose", composeFile: path };
  if (candidate.adapter === "local-process") return { platform: "local-process", manifestPath: path };
  return { platform: "kubernetes", manifestPath: path };
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function exists(path: string): Promise<boolean> { try { await access(path, constants.R_OK); return true; } catch { return false; } }
function configurationRequired(message: string): OnboardingOutcome { return { status: "needs_configuration", testedSchedules: 0, exploredCandidateSchedules: 0, diagnostics: [{ code: "configuration_required", message }] }; }
function unsupported(message: string): OnboardingOutcome { return { status: "unsupported_target", testedSchedules: 0, exploredCandidateSchedules: 0, diagnostics: [{ code: "unsupported_target", message }] }; }
function executionError(error: unknown): OnboardingOutcome { return { status: "execution_error", testedSchedules: 0, exploredCandidateSchedules: 0, diagnostics: [{ code: "onboarding_execution_error", message: error instanceof Error ? error.message : "onboarding execution failed" }] }; }
