import type { RunResult, Schedule, TargetConfig } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { discoverFailure, replayFailure } from "./orchestrator.js";

describe("orchestration", () => {
  const target: TargetConfig = { platform: "local-process", manifestPath: "race.json" };

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
      testedSchedules: 2,
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
      status: fails ? "fail" : "pass",
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
      result: { status: "fail" }
    });
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
        status: "fail",
        failureReason: "bootstrap unavailable",
        events: [{ timeMs: 725, service: "api", event: "different_failure" }],
        logs: []
      }))
    ).resolves.toMatchObject({ status: "not_reproduced" });
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
        status: "fail",
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

function fakeRun(schedule: Schedule): RunResult {
  const fails = (schedule.perturbations.find(
    ({ workloadId, phase }) => workloadId === "bootstrap" && phase === "ready"
  )?.delayMs ?? 0) >= 500;
  return {
    scheduleId: schedule.id,
    status: fails ? "fail" : "pass",
    events: fails ? [{ timeMs: 500, service: "api", event: "startup_failed" }] : [],
    logs: [],
    ...(fails ? { failureReason: "bootstrap unavailable" } : {})
  };
}
