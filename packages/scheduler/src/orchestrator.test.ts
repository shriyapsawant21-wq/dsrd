import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { discoverFailure, replayFailure } from "./orchestrator.js";

describe("orchestration", () => {
  it("searches, minimizes, and produces an artifact from runner evidence", async () => {
    const original: Schedule = {
      id: "schedule-001",
      services: {
        postgres: { readinessDelayMs: 1000 },
        api: { startDelayMs: 500 }
      }
    };

    const result = await discoverFailure({
      candidates: [{ id: "schedule-000", services: {} }, original],
      delayOptionsMs: [0, 500, 1000],
      createdAt: "2026-08-29T00:00:00.000Z",
      runSchedule: (schedule) => Promise.resolve(fakeRun(schedule))
    });

    expect(result).toEqual({
      status: "found_failure",
      testedSchedules: 2,
      artifact: {
        version: 1,
        createdAt: "2026-08-29T00:00:00.000Z",
        originalSchedule: original,
        minimizedSchedule: {
          id: "schedule-001-minimized",
          services: { postgres: { readinessDelayMs: 500 } }
        },
        expectedFailureReason: "database unavailable",
        events: [{ timeMs: 500, service: "api", event: "startup_failed" }]
      }
    });
  });

  it("reports replay success only when the runner reproduces expected failure evidence", async () => {
    const artifact = {
      version: 1 as const,
      createdAt: "2026-08-29T00:00:00.000Z",
      originalSchedule: { id: "original", services: {} },
      minimizedSchedule: {
        id: "minimal", services: { postgres: { readinessDelayMs: 500 } }
      },
      expectedFailureReason: "database unavailable",
      events: []
    };

    await expect(replayFailure(artifact, fakeRun)).resolves.toMatchObject({
      status: "reproduced",
      result: { status: "fail" }
    });
  });
});

function fakeRun(schedule: Schedule): RunResult {
  const fails = (schedule.services.postgres?.readinessDelayMs ?? 0) >= 500;
  return {
    scheduleId: schedule.id,
    status: fails ? "fail" : "pass",
    events: fails ? [{ timeMs: 500, service: "api", event: "startup_failed" }] : [],
    logs: [],
    ...(fails ? { failureReason: "database unavailable" } : {})
  };
}
