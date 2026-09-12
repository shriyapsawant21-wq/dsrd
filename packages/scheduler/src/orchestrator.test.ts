import type { RunResult, Schedule, TargetConfig } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { discoverFailure, replayFailure } from "./orchestrator.js";

describe("orchestration", () => {
  const target: TargetConfig = { platform: "local-process", manifestPath: "race.json" };

  it("rejects an unhealthy empty-schedule baseline without publishing an artifact", async () => {
    const result = await discoverFailure({
      candidates: [{ id: "candidate", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 1000],
      target,
      runSchedule: async (_target, schedule) => ({
        scheduleId: schedule.id,
        status: "workload_failure",
        failureReason: "target is already broken",
        events: [],
        logs: [],
      }),
    });

    expect(result).toEqual({ status: "target_unhealthy", testedSchedules: 1, exploredCandidateSchedules: 0 });
  });

  it("surfaces explicit local reset configuration errors without publishing an artifact", async () => {
    const result = await discoverFailure({
      candidates: [],
      delayOptionsMs: [0],
      target,
      runSchedule: async (_target, schedule) => ({
        scheduleId: schedule.id,
        status: "execution_error",
        events: [],
        logs: [],
        diagnostics: [{
          code: "local_process_reset_required",
          message: "This local-process target requires an explicit resetCommand before execution",
        }],
      }),
    });

    expect(result).toEqual({
      status: "needs_configuration",
      testedSchedules: 1,
      exploredCandidateSchedules: 0,
      diagnostics: [{
        code: "local_process_reset_required",
        message: "This local-process target requires an explicit resetCommand before execution",
      }],
    });
    expect(result).not.toHaveProperty("artifact");
  });

  it("runs three healthy baselines before exploring candidates by default", async () => {
    const calls: string[] = [];
    await discoverFailure({
      candidates: [{ id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 1000],
      target,
      runSchedule: async (_target, schedule) => {
        calls.push(schedule.id);
        return fakeRun(schedule);
      },
    });

    expect(calls.slice(0, 3)).toEqual(["baseline", "baseline", "baseline"]);
  });

  it("treats mismatched structured failure signatures as inconclusive", async () => {
    let candidateRuns = 0;
    const result = await discoverFailure({
      candidates: [{ id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 1000],
      target,
      baselineRuns: 1,
      confirmationRuns: 2,
      runSchedule: async (_target, schedule) => {
        if (schedule.perturbations.length === 0) return { scheduleId: schedule.id, status: "healthy", events: [], logs: [] };
        candidateRuns += 1;
        return {
          scheduleId: schedule.id,
          status: "workload_failure",
          failureReason: "startup failed",
          failureSignature: {
            workloadId: "api",
            assertionId: candidateRuns === 1 ? "database-ready" : "cache-ready",
            category: "readiness_failed" as const,
          },
          events: [],
          logs: [],
        };
      },
    });

    expect(result).toEqual({ status: "inconclusive", testedSchedules: 3, exploredCandidateSchedules: 1 });
  });

  it("does not publish an artifact when the independent replay does not reproduce", async () => {
    const result = await discoverFailure({
      candidates: [{ id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 1000],
      target,
      baselineRuns: 1,
      confirmationRuns: 1,
      runSchedule: async (_target, schedule) => fakeRun(schedule),
      replaySchedule: async (_target, schedule) => ({
        scheduleId: schedule.id,
        status: "healthy",
        events: [],
        logs: [],
      }),
    });

    expect(result).toMatchObject({ status: "inconclusive" });
    expect(result).not.toHaveProperty("artifact");
  });

  it("publishes a validated v3 artifact only after independent replay", async () => {
    const result = await discoverFailure({
      candidates: [{ id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 1000],
      target,
      baselineRuns: 1,
      confirmationRuns: 1,
      runSchedule: async (_target, schedule) => ({
        ...fakeRun(schedule),
        ...(schedule.perturbations.length === 0 ? {} : {
          failureSignature: { workloadId: "api", assertionId: "startup", category: "structured_failure" as const },
        }),
      }),
      replaySchedule: async (_target, schedule) => ({
        ...fakeRun(schedule),
        failureSignature: { workloadId: "api", assertionId: "startup", category: "structured_failure" as const },
      }),
      artifactV3: {
        repository: { snapshotId: "snapshot-1", contentDigest: "digest-1" },
        selectedTarget: { id: "local", adapter: "local-process", root: "/workspace", launchFiles: ["manifest.json"], requirements: [], evidence: [] },
        configDigest: "config-1",
        modelDigest: "model-1",
        environmentDigest: "environment-1",
        requiredBindings: [],
        policy: { baselineRuns: 1 },
        signature: { workloadId: "api", assertionId: "startup", category: "structured_failure" },
        orderingConstraints: [{
          before: { workloadId: "api", event: "startup_failed", occurrence: 0 },
          after: { workloadId: "api", event: "startup_failed", occurrence: 0 },
        }],
        verification: { baselineRuns: 1, confirmationRuns: 1, replayRuns: 1 },
      },
    });

    expect(result).toMatchObject({ status: "found_failure", artifact: { version: 3, signature: { assertionId: "startup" } } });
  });

  it("does not publish a v3 artifact when minimization changes the structured failure signature", async () => {
    const result = await discoverFailure({
      candidates: [{ id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 500, 1000],
      target,
      baselineRuns: 1,
      confirmationRuns: 1,
      runSchedule: async (_target, schedule) => {
        if (schedule.perturbations.length === 0) return { scheduleId: schedule.id, status: "healthy", events: [], logs: [] };
        const assertionId = schedule.perturbations[0]?.delayMs === 1000 ? "database-ready" : "cache-ready";
        return {
          scheduleId: schedule.id,
          status: "workload_failure",
          failureReason: "startup failed",
          failureSignature: { workloadId: "api", assertionId, category: "readiness_failed" as const },
          events: [{ timeMs: 1, service: "api", event: "startup_failed" }],
          logs: [],
        };
      },
      replaySchedule: async (_target, schedule) => ({
        scheduleId: schedule.id,
        status: "workload_failure",
        failureReason: "startup failed",
        failureSignature: { workloadId: "api", assertionId: "database-ready", category: "readiness_failed" },
        events: [{ timeMs: 1, service: "api", event: "startup_failed" }],
        logs: [],
      }),
      artifactV3: verifiedArtifactContext({ workloadId: "api", assertionId: "database-ready", category: "readiness_failed" }),
    });

    expect(result).toMatchObject({ status: "inconclusive" });
    expect(result).not.toHaveProperty("artifact");
  });

  it("requires every configured v3 replay repetition to reproduce the structured signature", async () => {
    let replayRuns = 0;
    const result = await discoverFailure({
      candidates: [{ id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] }],
      delayOptionsMs: [0, 1000],
      target,
      baselineRuns: 1,
      confirmationRuns: 1,
      runSchedule: async (_target, schedule) => ({
        ...fakeRun(schedule),
        ...(schedule.perturbations.length === 0 ? {} : {
          failureSignature: { workloadId: "api", assertionId: "startup", category: "structured_failure" as const },
        }),
      }),
      replaySchedule: async (_target, schedule) => {
        replayRuns += 1;
        return replayRuns === 1
          ? {
              ...fakeRun(schedule),
              failureSignature: { workloadId: "api", assertionId: "startup", category: "structured_failure" as const },
            }
          : { scheduleId: schedule.id, status: "healthy", events: [], logs: [] };
      },
      artifactV3: verifiedArtifactContext(
        { workloadId: "api", assertionId: "startup", category: "structured_failure" },
        { replayRuns: 2 },
      ),
    });

    expect(result).toMatchObject({ status: "inconclusive" });
    expect(result).not.toHaveProperty("artifact");
    expect(replayRuns).toBe(2);
  });

  it("searches, minimizes, and produces a target-bearing artifact from runner evidence", async () => {
    const original: Schedule = {
      id: "schedule-001",
      perturbations: [
        { workloadId: "bootstrap", phase: "ready", delayMs: 1000 },
        { workloadId: "api", phase: "start", delayMs: 500 }
      ]
    };

    const result = await discoverFailure({
      candidates: [{ id: "schedule-000", perturbations: [] }, original],
      delayOptionsMs: [0, 500, 1000],
      createdAt: "2026-08-29T00:00:00.000Z",
      target,
      runSchedule: (_target, schedule) => Promise.resolve(fakeRun(schedule))
    });

    expect(result).toEqual({
      status: "found_failure",
      testedSchedules: 13,
      exploredCandidateSchedules: 1,
      artifact: {
        version: 2,
        createdAt: "2026-08-29T00:00:00.000Z",
        target,
        originalSchedule: original,
        minimizedSchedule: {
          id: "schedule-001-minimized",
          perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 500 }]
        },
        expectedFailureReason: "bootstrap unavailable",
        events: [{ timeMs: 500, service: "api", event: "startup_failed" }]
      }
    });
  });

  it("keeps the reproducible schedule when a smaller candidate fails only once", async () => {
    const original: Schedule = {
      id: "schedule-001",
      perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }]
    };
    let lowerDelayRuns = 0;
    const resultFor = (schedule: Schedule, fails: boolean): RunResult => ({
      scheduleId: schedule.id,
      status: fails ? "workload_failure" : "healthy",
      events: [],
      logs: []
    });

    const result = await discoverFailure({
      candidates: [{ id: "schedule-000", perturbations: [] }, original],
      delayOptionsMs: [0, 500, 1000],
      target,
      runSchedule: async (_target, schedule) => {
        const delay = schedule.perturbations[0]?.delayMs ?? 0;
        if (delay === 500) {
          lowerDelayRuns += 1;
          return resultFor(schedule, lowerDelayRuns === 1);
        }
        return resultFor(schedule, delay === 1000);
      }
    });

    expect(result).toMatchObject({
      status: "found_failure",
      artifact: { minimizedSchedule: { perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] } }
    });
  });

  it("uses the injected replay function for the artifact target and minimized schedule", async () => {
    const artifact = {
      version: 2 as const,
      createdAt: "2026-08-29T00:00:00.000Z",
      target,
      originalSchedule: { id: "original", perturbations: [] },
      minimizedSchedule: {
        id: "minimal",
        perturbations: [{ workloadId: "bootstrap", phase: "ready" as const, delayMs: 500 }]
      },
      expectedFailureReason: "bootstrap unavailable",
      events: [{ timeMs: 425, service: "api", event: "startup_failed" }]
    };

    const replay = (replayTarget: TargetConfig, schedule: Schedule) => {
      expect(replayTarget).toEqual(target);
      return fakeRun(schedule);
    };

    await expect(replayFailure(artifact, replay)).resolves.toMatchObject({
      status: "reproduced",
      result: { status: "workload_failure" }
    });
  });

  it("returns inconclusive without publishing an artifact when the physical execution budget is exhausted", async () => {
    const calls: string[] = [];
    await expect(discoverFailure({
      candidates: [
        { id: "baseline", perturbations: [] },
        { id: "failing", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] },
      ],
      delayOptionsMs: [0, 500, 1000],
      target,
      maxSchedules: 2,
      baselineRuns: 1,
      confirmationRuns: 2,
      runSchedule: async (_target, schedule) => {
        calls.push(schedule.id);
        return fakeRun(schedule);
      },
    })).resolves.toEqual({
      status: "inconclusive",
      testedSchedules: 2,
      exploredCandidateSchedules: 1,
    });

    expect(calls).toEqual(["baseline", "failing"]);
  });

  it("does not reproduce when replay lacks the artifact oracle evidence", async () => {
    const artifact = {
      version: 2 as const,
      createdAt: "2026-08-29T00:00:00.000Z",
      target,
      originalSchedule: { id: "original", perturbations: [] },
      minimizedSchedule: {
        id: "minimal",
        perturbations: [{ workloadId: "bootstrap", phase: "ready" as const, delayMs: 500 }]
      },
      expectedFailureReason: "bootstrap unavailable",
      events: [{ timeMs: 500, service: "api", event: "startup_failed" }]
    };

    await expect(
      replayFailure(artifact, async (_target, schedule) => ({
        scheduleId: schedule.id,
        status: "workload_failure",
        failureReason: "bootstrap unavailable",
        events: [{ timeMs: 725, service: "api", event: "different_failure" }],
        logs: []
      }))
    ).resolves.toMatchObject({ status: "not_reproduced" });
  });

  it("does not reproduce when matching timeline evidence occurs in reverse order", async () => {
    const artifact = {
      version: 2 as const,
      createdAt: "2026-08-29T00:00:00.000Z",
      target,
      originalSchedule: { id: "original", perturbations: [] },
      minimizedSchedule: { id: "minimal", perturbations: [] },
      events: [
        { timeMs: 100, service: "postgres", event: "readiness_withheld" },
        { timeMs: 200, service: "api", event: "startup_failed" },
      ],
    };

    await expect(replayFailure(artifact, async (_target, schedule) => ({
      scheduleId: schedule.id,
      status: "workload_failure",
      events: [
        { timeMs: 100, service: "api", event: "startup_failed" },
        { timeMs: 200, service: "postgres", event: "readiness_withheld" },
      ],
      logs: [],
    }))).resolves.toMatchObject({ status: "not_reproduced" });
  });

  it("reproduces matching oracle evidence when diagnostic detail changes", async () => {
    const artifact = {
      version: 2 as const,
      createdAt: "2026-08-29T00:00:00.000Z",
      target,
      originalSchedule: { id: "original", perturbations: [] },
      minimizedSchedule: { id: "minimal", perturbations: [] },
      expectedFailureReason: "bootstrap unavailable",
      events: [{
        timeMs: 500,
        service: "api",
        event: "startup_failed",
        detail: "connect ECONNREFUSED 172.20.0.2:5432",
      }],
    };

    await expect(
      replayFailure(artifact, async (_target, schedule) => ({
        scheduleId: schedule.id,
        status: "workload_failure",
        failureReason: "bootstrap unavailable",
        events: [{
          timeMs: 725,
          service: "api",
          event: "startup_failed",
          detail: "connect ECONNREFUSED 172.21.0.2:5432",
        }],
        logs: [],
      })),
    ).resolves.toMatchObject({ status: "reproduced" });
  });
});

function verifiedArtifactContext(
  signature: { workloadId: string; assertionId: string; category: "unexpected_exit" | "readiness_failed" | "structured_failure" | "job_exit" },
  verification: Partial<{ baselineRuns: number; confirmationRuns: number; replayRuns: number }> = {},
) {
  return {
    repository: { snapshotId: "snapshot-1", contentDigest: "digest-1" },
    selectedTarget: { id: "local", adapter: "local-process" as const, root: "/workspace", launchFiles: ["manifest.json"], requirements: [], evidence: [] },
    configDigest: "config-1",
    modelDigest: "model-1",
    environmentDigest: "environment-1",
    requiredBindings: [],
    policy: { baselineRuns: 1 },
    signature,
    orderingConstraints: [{
      before: { workloadId: "api", event: "startup_failed", occurrence: 0 },
      after: { workloadId: "api", event: "startup_failed", occurrence: 0 },
    }],
    verification: { baselineRuns: 1, confirmationRuns: 1, replayRuns: 1, ...verification },
  };
}

function fakeRun(schedule: Schedule): RunResult {
  const fails = (schedule.perturbations.find(
    ({ workloadId, phase }) => workloadId === "bootstrap" && phase === "ready"
  )?.delayMs ?? 0) >= 500;
  return {
    scheduleId: schedule.id,
    status: fails ? "workload_failure" : "healthy",
    events: fails ? [{ timeMs: 500, service: "api", event: "startup_failed" }] : [],
    logs: [],
    ...(fails ? { failureReason: "bootstrap unavailable" } : {})
  };
}
