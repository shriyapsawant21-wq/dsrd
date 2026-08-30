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
