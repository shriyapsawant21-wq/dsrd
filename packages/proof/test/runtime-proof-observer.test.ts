import type { ObservationSnapshot as RuntimeSnapshot } from "@dsrd/runtime";
import { describe, expect, it, vi } from "vitest";

import { RuntimeProofObserver } from "../src/runtime-proof-observer.js";
import type { ReadinessObservation } from "../src/probes/types.js";

function runtimeSnapshot(): RuntimeSnapshot {
  return {
    scheduleId: "four-service-normal",
    services: [
      { service: "postgres", state: "running", health: "healthy" },
      { service: "cache", state: "running", health: "healthy" },
      { service: "api", state: "running", health: "healthy" },
      { service: "worker", state: "exited", exitCode: 0 },
    ],
    logs: ['worker-1 | {"event":"work_succeeded","timeMs":80}'],
  };
}

describe("RuntimeProofObserver", () => {
  it("generates a passing shared RunResult from runtime evidence", async () => {
    const httpProbe = vi.fn(async (): Promise<ReadinessObservation> => ({
      service: "api",
      kind: "http",
      status: "ready",
      observedAtMs: 1_080,
    }));
    const tcpProbe = vi.fn(async (): Promise<ReadinessObservation> => ({
      service: "postgres",
      kind: "tcp",
      status: "ready",
      observedAtMs: 1_050,
    }));
    const observer = new RuntimeProofObserver({
      now: () => 1_000,
      httpProbe,
      tcpProbe,
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    const result = await observer.evaluate(runtimeSnapshot());

    expect(result).toMatchObject({
      scheduleId: "four-service-normal",
      status: "pass",
    });
    expect(httpProbe).toHaveBeenCalledOnce();
    expect(tcpProbe).toHaveBeenCalledOnce();
    expect(result.events).toContainEqual({
      timeMs: 80,
      service: "worker",
      event: "work_succeeded",
    });
  });

  it("returns specific deterministic evidence for the PostgreSQL race", async () => {
    const snapshot = runtimeSnapshot();
    snapshot.services = [
      { service: "postgres", state: "running" },
      { service: "cache", state: "running", health: "healthy" },
      { service: "api", state: "exited", exitCode: 1 },
      { service: "worker", state: "exited", exitCode: 1 },
    ];
    snapshot.logs = [
      'api-1 | {"event":"db_connection_failed","message":"connect ECONNREFUSED postgres:5432","timeMs":25}',
    ];
    const observer = new RuntimeProofObserver({
      now: () => 1_000,
      httpProbe: async () => ({
        service: "api",
        kind: "http",
        status: "timeout",
        observedAtMs: 1_500,
      }),
      tcpProbe: async () => ({
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_300,
      }),
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    const result = await observer.evaluate(snapshot);

    expect(result).toMatchObject({
      status: "fail",
      failureReason: "PostgreSQL connection was refused (api)",
    });
    expect(result.logs).toEqual(snapshot.logs);
    expect(result.events).toContainEqual({
      timeMs: 25,
      service: "api",
      event: "db_connection_failed",
      detail: "connect ECONNREFUSED postgres:5432",
    });
  });

  it("refreshes services and logs after probes before classification", async () => {
    const snapshot = runtimeSnapshot();
    snapshot.services = snapshot.services.map((service) =>
      service.service === "worker"
        ? { service: "worker", state: "running" }
        : service,
    );
    snapshot.logs = [];
    snapshot.refresh = vi.fn(async () => ({
      services: runtimeSnapshot().services,
      logs: [
        'dsrd-startup-race-worker-1 | {"service":"worker","event":"work_succeeded"}',
      ],
    }));
    const times = [1_000, 1_500];
    const observer = new RuntimeProofObserver({
      now: () => times.shift() ?? 1_500,
      httpProbe: async () => ({
        service: "api",
        kind: "http",
        status: "ready",
        observedAtMs: 1_400,
      }),
      tcpProbe: async () => ({
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_300,
      }),
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    const result = await observer.evaluate(snapshot);

    expect(snapshot.refresh).toHaveBeenCalledOnce();
    expect(result.status).toBe("pass");
    expect(result.events).toContainEqual({
      timeMs: 500,
      service: "worker",
      event: "container_exited",
      detail: "exit code 0",
    });
    expect(result.events).toContainEqual({
      timeMs: 500,
      service: "worker",
      event: "work_succeeded",
    });
  });

  it("keeps refreshing while the worker is still running", async () => {
    const snapshot = runtimeSnapshot();
    snapshot.services = snapshot.services.map((service) =>
      service.service === "worker"
        ? { service: "worker", state: "running" }
        : service,
    );
    const runningEvidence = {
      services: snapshot.services,
      logs: [] as string[],
    };
    const completedEvidence = {
      services: runtimeSnapshot().services,
      logs: ['worker-1 | {"service":"worker","event":"work_succeeded"}'],
    };
    snapshot.refresh = vi
      .fn()
      .mockResolvedValueOnce(runningEvidence)
      .mockResolvedValueOnce(completedEvidence);
    let currentTime = 1_000;
    const observer = new RuntimeProofObserver({
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
      httpProbe: async () => ({
        service: "api",
        kind: "http",
        status: "ready",
        observedAtMs: 1_000,
      }),
      tcpProbe: async () => ({
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_000,
      }),
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    const result = await observer.evaluate(snapshot);

    expect(snapshot.refresh).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("pass");
  });

  it("does not reuse the readiness timeout as the worker completion deadline", async () => {
    const snapshot = runtimeSnapshot();
    const runningEvidence = {
      services: snapshot.services.map((service) =>
        service.service === "worker"
          ? { service: "worker", state: "running" }
          : service,
      ),
      logs: [] as string[],
    };
    snapshot.refresh = vi
      .fn()
      .mockResolvedValueOnce(runningEvidence)
      .mockResolvedValueOnce(runningEvidence)
      .mockResolvedValueOnce({
        services: runtimeSnapshot().services,
        logs: ['worker-1 | {"service":"worker","event":"work_succeeded"}'],
      });
    let currentTime = 1_000;
    const observer = new RuntimeProofObserver({
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
      httpProbe: async () => ({
        service: "api",
        kind: "http",
        status: "ready",
        observedAtMs: 1_000,
      }),
      tcpProbe: async () => ({
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_000,
      }),
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 50,
      pollIntervalMs: 100,
    });

    const result = await observer.evaluate(snapshot);

    expect(currentTime).toBeGreaterThan(1_050);
    expect(snapshot.refresh).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("pass");
  });

  it("stops refreshing when runtime observation is aborted", async () => {
    const controller = new AbortController();
    const snapshot = runtimeSnapshot();
    snapshot.services = snapshot.services.map((service) =>
      service.service === "worker"
        ? { service: "worker", state: "running" }
        : service,
    );
    snapshot.signal = controller.signal;
    snapshot.refresh = vi.fn(async () => ({
      services: snapshot.services,
      logs: [],
    }));
    const observer = new RuntimeProofObserver({
      sleep: async () => controller.abort(),
      httpProbe: async () => ({
        service: "api",
        kind: "http",
        status: "ready",
        observedAtMs: 1_000,
      }),
      tcpProbe: async () => ({
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_000,
      }),
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 50,
      pollIntervalMs: 10,
    });

    await expect(observer.evaluate(snapshot)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(snapshot.refresh).toHaveBeenCalledOnce();
  });

  it("treats a dead worker as terminal evidence", async () => {
    const snapshot = runtimeSnapshot();
    snapshot.refresh = vi.fn(async () => ({
      services: snapshot.services.map((service) =>
        service.service === "worker"
          ? { service: "worker", state: "dead", exitCode: 1 }
          : service,
      ),
      logs: ["worker-1 | startup failed"],
    }));
    const observer = new RuntimeProofObserver({
      httpProbe: async () => ({
        service: "api",
        kind: "http",
        status: "ready",
        observedAtMs: 1_000,
      }),
      tcpProbe: async () => ({
        service: "postgres",
        kind: "tcp",
        status: "ready",
        observedAtMs: 1_000,
      }),
      apiUrl: "http://127.0.0.1:53000/health",
      postgresHost: "127.0.0.1",
      postgresPort: 55_432,
      timeoutMs: 50,
      pollIntervalMs: 10,
    });

    const result = await observer.evaluate(snapshot);

    expect(snapshot.refresh).toHaveBeenCalledOnce();
    expect(result.status).toBe("fail");
  });
});
