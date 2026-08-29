import { describe, expect, it } from "vitest";

import { evaluateRun } from "../src/oracle/evaluate.js";
import type { ObservationSnapshot } from "../src/oracle/types.js";

function passingSnapshot(): ObservationSnapshot {
  return {
    scheduleId: "normal",
    startedAtMs: 1_000,
    containers: [
      { service: "postgres", state: "running", observedAtMs: 1_010 },
      { service: "api", state: "running", observedAtMs: 1_020 },
      {
        service: "worker",
        state: "exited",
        exitCode: 0,
        observedAtMs: 1_100,
      },
    ],
    readiness: [
      {
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_050,
      },
      {
        service: "api",
        kind: "http",
        status: "ready",
        observedAtMs: 1_080,
      },
    ],
    fixtureEvents: [
      { timeMs: 100, service: "worker", event: "work_succeeded" },
    ],
    logFailures: [],
    logs: ["historical text containing ECONNREFUSED is not an oracle"],
  };
}

describe("deterministic failure oracle", () => {
  it("returns pass only when all required success evidence exists", () => {
    const result = evaluateRun(passingSnapshot());

    expect(result.status).toBe("pass");
    expect(result.failureReason).toBeUndefined();
    expect(result.scheduleId).toBe("normal");
    expect(result.logs).toEqual([
      "historical text containing ECONNREFUSED is not an oracle",
    ]);
    expect(result.events).toContainEqual({
      timeMs: 100,
      service: "worker",
      event: "work_succeeded",
    });
  });

  it("prioritizes a non-zero API exit over all other failures", () => {
    const snapshot = passingSnapshot();
    snapshot.containers = [
      { service: "api", state: "exited", exitCode: 1, observedAtMs: 1_030 },
      { service: "worker", state: "exited", exitCode: 1, observedAtMs: 1_040 },
    ];
    snapshot.readiness = [
      {
        service: "api",
        kind: "http",
        status: "timeout",
        observedAtMs: 2_000,
      },
      {
        service: "postgres",
        kind: "tcp",
        status: "timeout",
        observedAtMs: 2_000,
      },
    ];

    expect(evaluateRun(snapshot)).toMatchObject({
      status: "fail",
      failureReason: "API exited during startup before becoming ready",
    });
  });

  it.each(["timeout", "unhealthy"] as const)(
    "fails when API HTTP readiness is %s",
    (status) => {
      const snapshot = passingSnapshot();
      snapshot.readiness = snapshot.readiness.map((observation) =>
        observation.service === "api" ? { ...observation, status } : observation,
      );

      expect(evaluateRun(snapshot)).toMatchObject({
        status: "fail",
        failureReason: "API did not become ready before the startup deadline",
      });
    },
  );

  it("fails when the worker exits non-zero", () => {
    const snapshot = passingSnapshot();
    snapshot.containers = snapshot.containers.map((container) =>
      container.service === "worker" ? { ...container, exitCode: 1 } : container,
    );

    expect(evaluateRun(snapshot)).toMatchObject({
      status: "fail",
      failureReason: "Worker could not complete its startup API request",
    });
  });

  it("fails when PostgreSQL TCP readiness times out", () => {
    const snapshot = passingSnapshot();
    snapshot.readiness = snapshot.readiness.map((observation) =>
      observation.service === "postgres"
        ? { ...observation, status: "timeout" }
        : observation,
    );

    expect(evaluateRun(snapshot)).toMatchObject({
      status: "fail",
      failureReason: "PostgreSQL did not become ready before the startup deadline",
    });
  });

  it("fails closed when evidence is incomplete", () => {
    const snapshot = passingSnapshot();
    snapshot.containers = snapshot.containers.filter(
      (container) => container.service !== "worker",
    );

    expect(evaluateRun(snapshot)).toMatchObject({
      status: "fail",
      failureReason: "Run ended without complete pass evidence",
    });
  });

  it("uses deterministic parsed evidence to explain an incomplete run", () => {
    const snapshot = passingSnapshot();
    snapshot.containers = snapshot.containers.filter(
      (container) => container.service !== "worker",
    );
    snapshot.logFailures = [
      {
        service: "api",
        category: "connection_refused",
        summary: "PostgreSQL connection was refused",
        raw: "api-1 | connect ECONNREFUSED postgres:5432",
      },
    ];

    expect(evaluateRun(snapshot)).toMatchObject({
      status: "fail",
      failureReason: "PostgreSQL connection was refused (api)",
    });
  });

  it("does not let parsed historical errors override complete pass evidence", () => {
    const snapshot = passingSnapshot();
    snapshot.logFailures = [
      {
        service: "api",
        category: "connection_refused",
        summary: "PostgreSQL connection was refused",
        raw: "old error",
      },
    ];

    expect(evaluateRun(snapshot).status).toBe("pass");
  });
});
