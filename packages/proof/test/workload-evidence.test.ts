import { describe, expect, it } from "vitest";

import {
  buildWorkloadTimeline,
  evaluateWorkloadRun,
  WorkloadProofObserver,
  type WorkloadObservationSnapshot,
} from "../src/index.js";

function passingSnapshot(): WorkloadObservationSnapshot {
  return {
    scheduleId: "generic-normal",
    startedAtMs: 1_000,
    workloads: [
      {
        id: "catalog-db",
        kind: "service",
        perturbablePhases: ["start", "ready"],
        readiness: { type: "tcp", target: "127.0.0.1:5432" },
      },
      {
        id: "catalog-http",
        kind: "process",
        dependsOn: ["catalog-db"],
        perturbablePhases: ["start", "ready"],
        readiness: { type: "http", target: "http://127.0.0.1/health" },
      },
      {
        id: "sqlite-migrate",
        kind: "initializer",
        perturbablePhases: ["start"],
      },
    ],
    states: [
      {
        workload: "catalog-db",
        state: "running",
        health: "healthy",
        observedAtMs: 1_020,
      },
      {
        workload: "catalog-http",
        state: "running",
        health: "healthy",
        observedAtMs: 1_030,
      },
      {
        workload: "sqlite-migrate",
        state: "exited",
        exitCode: 0,
        observedAtMs: 1_040,
      },
    ],
    readiness: [
      {
        workload: "catalog-db",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_025,
      },
      {
        workload: "catalog-http",
        kind: "http",
        status: "ready",
        observedAtMs: 1_035,
      },
    ],
    workloadEvents: [],
    logFailures: [],
    logs: [],
  };
}

describe("C3 workload proof evidence", () => {
  it("rejects empty discovery instead of vacuously passing", () => {
    const snapshot = passingSnapshot();
    snapshot.workloads = [];
    snapshot.states = [];
    snapshot.readiness = [];

    expect(() => evaluateWorkloadRun(snapshot)).toThrow(
      "Cannot evaluate proof without workloads",
    );
  });

  it("maps normalized initializer identity into timeline compatibility shape", () => {
    const snapshot = passingSnapshot();
    snapshot.readiness = [
      {
        workload: "sqlite-migrate",
        kind: "process",
        status: "timeout",
        observedAtMs: 1_020,
      },
    ];

    expect(buildWorkloadTimeline(snapshot)).toContainEqual({
      timeMs: 20,
      service: "sqlite-migrate",
      event: "process_timeout",
    });
  });

  it("orders equal-time timeline evidence by locale-independent code points", () => {
    const snapshot = passingSnapshot();
    snapshot.states = [];
    snapshot.readiness = [];
    snapshot.workloadEvents = [
      { workload: "ä-worker", timeMs: 20, event: "started" },
      { workload: "z-worker", timeMs: 20, event: "started" },
    ];

    expect(buildWorkloadTimeline(snapshot).map((event) => event.service)).toEqual([
      "z-worker",
      "ä-worker",
    ]);
  });

  it("passes without knowing platform-specific service names", () => {
    expect(evaluateWorkloadRun(passingSnapshot())).toMatchObject({
      scheduleId: "generic-normal",
      status: "pass",
    });
  });

  it("fails deterministically when any workload exits non-zero", () => {
    const snapshot = passingSnapshot();
    snapshot.states = snapshot.states.map((state) =>
      state.workload === "sqlite-migrate"
        ? { ...state, exitCode: 7 }
        : state,
    );

    expect(evaluateWorkloadRun(snapshot)).toMatchObject({
      status: "fail",
      failureReason: "sqlite-migrate exited with code 7",
    });
  });

  it("normalizes adapter logs without knowing the execution platform", async () => {
    const snapshot = passingSnapshot();
    snapshot.states = snapshot.states.map((state) =>
      state.workload === "catalog-http"
        ? { ...state, state: "exited", exitCode: 1 }
        : state,
    );
    snapshot.logs = [
      'any-platform-prefix | {"service":"catalog-http","event":"dependency_not_ready","detail":"catalog-db unavailable"}',
    ];
    const observer = new WorkloadProofObserver();

    const result = await observer.evaluate(snapshot);

    expect(result).toMatchObject({
      status: "fail",
      failureReason: "Dependency was not ready (catalog-http)",
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        service: "catalog-http",
        event: "dependency_not_ready",
      }),
    );
  });

  it("prefers workload identity in platform-neutral structured logs", async () => {
    const snapshot = passingSnapshot();
    snapshot.states = snapshot.states.map((state) =>
      state.workload === "sqlite-migrate"
        ? { ...state, exitCode: 1 }
        : state,
    );
    snapshot.logs = [
      '{"workload":"sqlite-migrate","event":"startup_failed","detail":"migration failed"}',
    ];

    const result = await new WorkloadProofObserver().evaluate(snapshot);

    expect(result.failureReason).toBe("Dependency was not ready (sqlite-migrate)");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        service: "sqlite-migrate",
        event: "startup_failed",
      }),
    );
  });
});
