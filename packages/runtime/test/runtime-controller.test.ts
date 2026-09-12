import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  DockerRuntimeController,
  RunTimeoutError,
  type ComposeRuntime,
  type Delay,
  type ObservationSnapshot,
  type ReadinessDelayAdapter,
  type StartDelayGate,
  type RunObserver
} from "../src/index.js";

const passingResult: RunResult = {
  scheduleId: "schedule-1",
  status: "healthy",
  events: [],
  logs: []
};

class RecordingCompose implements ComposeRuntime {
  readonly actions: string[] = [];
  failStartFor?: string;
  failStop = false;

  async prepare(): Promise<void> {
    this.actions.push("prepare");
  }

  async resetStack(): Promise<void> {
    this.actions.push("reset");
  }

  async startService(service: string): Promise<void> {
    this.actions.push(`start:${service}`);
    if (service === this.failStartFor) {
      throw new Error(`cannot start ${service}`);
    }
  }

  async startServices(services: string[]): Promise<void> {
    this.actions.push(`start-all:${services.join(",")}`);
    const failedService = services.find((service) => service === this.failStartFor);
    if (failedService !== undefined) {
      throw new Error(`cannot start ${failedService}`);
    }
  }

  async collectLogs(): Promise<string[]> {
    this.actions.push("logs");
    return [];
  }

  async listServices(): Promise<[]> {
    this.actions.push("ps");
    return [];
  }

  async stopStack(): Promise<void> {
    this.actions.push("stop");
    if (this.failStop) {
      throw new Error("cleanup failed");
    }
  }
}

class SlowResetCompose extends RecordingCompose {
  override async resetStack(): Promise<void> {
    this.actions.push("reset");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

class RecordingDelay implements Delay {
  constructor(private readonly actions: string[]) {}

  async wait(delayMs: number): Promise<void> {
    this.actions.push(`wait:${delayMs}`);
  }
}

class BlockingDelay implements Delay {
  private releaseDelay?: () => void;

  async wait(delayMs: number): Promise<void> {
    if (delayMs === 100) {
      await new Promise<void>((resolve) => {
        this.releaseDelay = resolve;
      });
    }
  }

  release(): void {
    this.releaseDelay?.();
  }
}

class BlockingStartCompose extends RecordingCompose {
  private resolveStartEntered?: () => void;
  private resolveStart?: () => void;
  private readonly startEntered = new Promise<void>((resolve) => {
    this.resolveStartEntered = resolve;
  });

  override async startService(service: string): Promise<void> {
    this.actions.push(`start:${service}`);
    if (service === "api") {
      this.resolveStartEntered?.();
      await new Promise<void>((resolve) => {
        this.resolveStart = resolve;
      });
      this.actions.push(`started:${service}`);
    }
  }

  override async startServices(services: string[]): Promise<void> {
    for (const service of services) await this.startService(service);
  }

  waitForStart(): Promise<void> {
    return this.startEntered;
  }

  releaseStart(): void {
    this.resolveStart?.();
  }
}

class BlockingLogsCompose extends RecordingCompose {
  private resolveLogsEntered?: () => void;
  private resolveLogs?: () => void;
  private readonly logsEntered = new Promise<void>((resolve) => {
    this.resolveLogsEntered = resolve;
  });

  override async collectLogs(): Promise<string[]> {
    this.actions.push("logs");
    this.resolveLogsEntered?.();
    await new Promise<void>((resolve) => {
      this.resolveLogs = resolve;
    });
    return [];
  }

  waitForLogs(): Promise<void> {
    return this.logsEntered;
  }

  releaseLogs(): void {
    this.resolveLogs?.();
  }
}

class AbortableRefreshCompose extends RecordingCompose {
  private logCalls = 0;
  private releaseRefresh?: () => void;
  private resolveRefreshStarted?: () => void;
  private readonly refreshStarted = new Promise<void>((resolve) => {
    this.resolveRefreshStarted = resolve;
  });
  refreshSignal?: AbortSignal;

  override async collectLogs(signal?: AbortSignal): Promise<string[]> {
    this.actions.push("logs");
    this.logCalls += 1;
    if (this.logCalls === 1) {
      return [];
    }
    this.refreshSignal = signal;
    this.resolveRefreshStarted?.();
    await new Promise<void>((resolve) => {
      this.releaseRefresh = resolve;
    });
    throw signal?.reason;
  }

  waitForRefresh(): Promise<void> {
    return this.refreshStarted;
  }

  release(): void {
    this.releaseRefresh?.();
  }
}

class AbortableStartCompose extends RecordingCompose {
  override async startService(
    service: string,
    options?: { includeDependencies?: boolean; signal?: AbortSignal },
  ): Promise<void> {
    this.actions.push(`start:${service}`);
    await new Promise<void>((_resolve, reject) => {
      const signal = options?.signal;
      if (signal === undefined) {
        return;
      }
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }

  override async startServices(services: string[], options?: { signal?: AbortSignal }): Promise<void> {
    for (const service of services) await this.startService(service, options);
  }
}

class RecordingObserver implements RunObserver {
  snapshot?: ObservationSnapshot;

  constructor(
    private readonly result: RunResult = passingResult,
    private readonly failure?: Error
  ) {}

  async evaluate(snapshot: ObservationSnapshot): Promise<RunResult> {
    this.snapshot = snapshot;
    if (this.failure !== undefined) {
      throw this.failure;
    }
    return this.result;
  }
}

class RecordingReadinessDelay implements ReadinessDelayAdapter {
  constructor(private readonly actions: string[]) {}

  async apply(service: string, delayMs: number): Promise<void> {
    this.actions.push(`readiness:${service}:${delayMs}`);
  }

  async clear(): Promise<void> {
    this.actions.push("readiness:clear");
  }
}

class RecordingStartDelayGate implements StartDelayGate {
  private releaseGate?: () => void;

  constructor(private readonly actions: string[]) {}

  async wait(service: string): Promise<void> {
    this.actions.push(`gate:${service}`);
    await new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  release(): void {
    this.releaseGate?.();
  }
}

const schedule: Schedule = {
  id: "schedule-1",
  perturbations: [
    { workloadId: "postgres", phase: "start", delayMs: 100 },
    { workloadId: "worker", phase: "start", delayMs: 25 }
  ]
};

describe("DockerRuntimeController", () => {
  it("classifies a failed Compose operation as an execution error and cleans its stack", async () => {
    const compose = new RecordingCompose();
    compose.failStartFor = "api";
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(),
    });

    await expect(controller.runSchedule({ id: "broken-start", perturbations: [] }, ["api"])).resolves.toEqual({
      scheduleId: "broken-start",
      status: "execution_error",
      events: [],
      logs: [],
      diagnostics: [{ code: "runtime_operation_failed", message: "cannot start api" }],
    });
    expect(compose.actions).toEqual(["prepare", "reset", "start-all:api", "stop"]);
  });

  it("resets, starts services in schedule order, observes, and cleans up", async () => {
    const compose = new RecordingCompose();
    const delay = new RecordingDelay(compose.actions);
    const observer = new RecordingObserver();
    const controller = new DockerRuntimeController({ compose, delay, observer });

    const result = await controller.runSchedule(schedule, ["postgres", "api", "worker"]);

    expect(result).toEqual(passingResult);
    expect(compose.actions).toEqual([
      "prepare",
      "reset",
      "wait:100",
      "wait:0",
      "wait:25",
      "start:postgres",
      "start:api",
      "start:worker",
      "logs",
      "ps",
      "stop"
    ]);
    expect(observer.snapshot).toMatchObject({
      scheduleId: "schedule-1",
      logs: [],
      services: [],
    });
    expect(observer.snapshot?.events).toEqual(expect.arrayContaining([
      { timeMs: 0, service: "postgres", event: "scheduled_start_delay", detail: "100ms" },
      { timeMs: 0, service: "worker", event: "scheduled_start_delay", detail: "25ms" },
      expect.objectContaining({ service: "postgres", event: "actual_service_start" }),
      expect.objectContaining({ service: "worker", event: "actual_service_start" }),
    ]));
    expect(observer.snapshot?.refresh).toBeTypeOf("function");
  });

  it("starts un-delayed services before a delayed service becomes startable", async () => {
    const compose = new RecordingCompose();
    const delay = new BlockingDelay();
    const controller = new DockerRuntimeController({
      compose,
      delay,
      observer: new RecordingObserver(),
    });

    const run = controller.runSchedule({
      id: "delay-postgres",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 100 }],
    }, ["postgres", "api", "worker"]);

    await vi.waitFor(() => {
      expect(compose.actions).toEqual(expect.arrayContaining(["start:api", "start:worker"]));
    });
    expect(compose.actions).not.toContain("start:postgres");

    delay.release();
    await run;
  });

  it("waits for the start-delay gate before applying a delayed service timer", async () => {
    const compose = new RecordingCompose();
    const gate = new RecordingStartDelayGate(compose.actions);
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(),
      startDelayGate: gate,
    });

    const run = controller.runSchedule({
      id: "gated-postgres",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 100 }],
    }, ["postgres", "api"]);

    await vi.waitFor(() => {
      expect(compose.actions).toContain("start:api");
    });
    expect(compose.actions).toEqual(["prepare", "reset", "gate:postgres", "wait:0", "start:api"]);

    gate.release();
    await run;
    expect(compose.actions).toEqual([
      "prepare",
      "reset",
      "gate:postgres",
      "wait:0",
      "start:api",
      "wait:100",
      "start:postgres",
      "logs",
      "ps",
      "stop",
    ]);
  });

  it("cancels a delayed independent start when a sibling start fails", async () => {
    const compose = new RecordingCompose();
    compose.failStartFor = "api";
    const delay = new BlockingDelay();
    const controller = new DockerRuntimeController({
      compose,
      delay,
      observer: new RecordingObserver(),
    });

    await expect(controller.runSchedule({
      id: "failed-api-before-postgres",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 100 }],
    }, ["api", "postgres"])).resolves.toMatchObject({
      status: "execution_error",
      diagnostics: [{ code: "runtime_operation_failed", message: "cannot start api" }],
    });

    delay.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compose.actions).not.toContain("start:postgres");
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("cancels a delayed independent start when the run times out", async () => {
    const compose = new RecordingCompose();
    const delay = new BlockingDelay();
    const controller = new DockerRuntimeController({
      compose,
      delay,
      observer: new RecordingObserver(),
      runTimeoutMs: 10,
    });

    await expect(controller.runSchedule({
      id: "timed-out-before-postgres",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 100 }],
    }, ["postgres"])).resolves.toMatchObject({
      status: "execution_error",
      diagnostics: [{ code: "run_timeout" }],
    });

    delay.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compose.actions).not.toContain("start:postgres");
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("waits for an in-flight independent start before timeout cleanup", async () => {
    const compose = new BlockingStartCompose();
    const delay = new BlockingDelay();
    const controller = new DockerRuntimeController({
      compose,
      delay,
      observer: new RecordingObserver(),
      runTimeoutMs: 10,
    });
    const run = controller.runSchedule({
      id: "timed-out-during-api-start",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 100 }],
    }, ["api", "postgres"]);
    const runFailure = run.catch((error: unknown) => error);

    await compose.waitForStart();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    try {
      expect(compose.actions).not.toContain("stop");
    } finally {
      compose.releaseStart();
    }
    await expect(runFailure).resolves.toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compose.actions).toEqual(["prepare", "reset", "start:api", "started:api", "stop"]);
  });

  it("reports a drain timeout and still attempts exact-stack cleanup", async () => {
    const compose = new BlockingStartCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new BlockingDelay(),
      observer: new RecordingObserver(),
      runTimeoutMs: 10,
      operationDrainTimeoutMs: 10,
    });
    const run = controller.runSchedule({
      id: "non-closing-start",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 100 }],
    }, ["api", "postgres"]);

    await compose.waitForStart();
    try {
      const outcome = await Promise.race([
        run,
        new Promise<"still-running">((resolve) => setTimeout(() => resolve("still-running"), 100)),
      ]);
      expect(outcome).toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
      expect(compose.actions).toContain("stop");
    } finally {
      compose.releaseStart();
    }
  });

  it("does not observe after a timed-out start settles", async () => {
    const compose = new BlockingStartCompose();
    const observer = new RecordingObserver();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer,
      runTimeoutMs: 10,
    });
    const run = controller.runSchedule({
      id: "timed-out-before-observation",
      perturbations: [],
    }, ["api"]);

    await compose.waitForStart();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    compose.releaseStart();
    await expect(run).resolves.toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(compose.actions).not.toContain("logs");
    expect(compose.actions).not.toContain("ps");
    expect(observer.snapshot).toBeUndefined();
  });

  it("does not continue observation when log collection outlives the timeout", async () => {
    const compose = new BlockingLogsCompose();
    const observer = new RecordingObserver();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer,
      runTimeoutMs: 10,
    });
    const run = controller.runSchedule({
      id: "timed-out-during-log-collection",
      perturbations: [],
    }, ["api"]);

    await compose.waitForLogs();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(compose.actions).not.toContain("stop");
    compose.releaseLogs();
    await expect(run).resolves.toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compose.actions).not.toContain("ps");
    expect(observer.snapshot).toBeUndefined();
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("aborts an observer refresh before timeout cleanup", async () => {
    vi.useFakeTimers();
    const compose = new AbortableRefreshCompose();
    const observer: RunObserver = {
      evaluate: async (snapshot) => {
        await snapshot.refresh?.();
        return passingResult;
      },
    };
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer,
      runTimeoutMs: 100,
    });

    const run = controller.runSchedule({ id: "refresh-stalled", perturbations: [] }, []);
    const runFailure = run.catch((error: unknown) => error);
    await compose.waitForRefresh();
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(compose.refreshSignal?.aborted).toBe(true);
      expect(compose.actions).not.toContain("stop");
      compose.release();
      const failure = await runFailure;
      expect(failure).toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
      expect(compose.actions).toEqual(["prepare", "reset", "start-all:", "logs", "ps", "logs", "stop"]);
    } finally {
      compose.release();
      vi.useRealTimers();
    }
  });

  it("aborts an in-flight Compose start before timeout cleanup", async () => {
    const compose = new AbortableStartCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(),
      runTimeoutMs: 10,
    });

    const outcome = await Promise.race([
      controller.runSchedule({
        id: "timed-out-during-compose-start",
        perturbations: [],
      }, ["api"]).catch((error: unknown) => error),
      new Promise<"still-running">((resolve) => setTimeout(() => resolve("still-running"), 50)),
    ]);

    expect(outcome).toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("stops the stack when a service fails to start", async () => {
    const compose = new RecordingCompose();
    compose.failStartFor = "api";
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver()
    });

    await expect(controller.runSchedule(schedule, ["postgres", "api", "worker"])).resolves.toMatchObject({ status: "execution_error" });
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("stops the stack when the observer fails", async () => {
    const compose = new RecordingCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(passingResult, new Error("oracle unavailable"))
    });

    await expect(controller.runSchedule(schedule, ["postgres", "api", "worker"])).resolves.toMatchObject({ status: "execution_error" });
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("provides a refresh callback for post-probe state and logs", async () => {
    const compose = new RecordingCompose();
    const observer: RunObserver = {
      evaluate: async (snapshot) => {
        expect(snapshot.refresh).toBeTypeOf("function");
        await snapshot.refresh?.();
        return passingResult;
      },
    };
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer,
    });

    await controller.runSchedule(schedule, ["postgres", "api", "worker"]);

    expect(compose.actions.slice(-5)).toEqual([
      "logs",
      "ps",
      "logs",
      "ps",
      "stop",
    ]);
  });

  it("preserves both the run failure and a cleanup failure", async () => {
    const compose = new RecordingCompose();
    compose.failStartFor = "api";
    compose.failStop = true;
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver()
    });

    const result = await controller.runSchedule(schedule, ["postgres", "api", "worker"]);

    expect(result).toMatchObject({
      status: "execution_error",
      diagnostics: [{ code: "runtime_operation_failed", message: expect.stringContaining("cleanup also failed") }],
    });
  });

  it("rejects malformed delays before resetting Docker", async () => {
    const compose = new RecordingCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver()
    });

    await expect(
      controller.runSchedule({
        id: "invalid",
        perturbations: [{ workloadId: "api", phase: "start", delayMs: -1 }]
      }, ["api"])
    ).rejects.toThrow("api.start delayMs must be a non-negative finite integer");
    expect(compose.actions).toEqual([]);
  });

  it("rejects readiness delays when no fixture adapter is configured", async () => {
    const compose = new RecordingCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver()
    });

    await expect(
      controller.runSchedule({
        id: "unsupported",
        perturbations: [{ workloadId: "postgres", phase: "ready", delayMs: 1500 }]
      }, ["postgres"])
    ).rejects.toThrow("ready perturbations require a readiness delay adapter");
    expect(compose.actions).toEqual([]);
  });

  it("applies fixture readiness delays before starts and clears them after the run", async () => {
    const compose = new RecordingCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(),
      readinessDelay: new RecordingReadinessDelay(compose.actions)
    });

    await controller.runSchedule({
      id: "readiness",
      perturbations: [{ workloadId: "postgres", phase: "ready", delayMs: 1500 }]
    }, ["postgres", "api"]);

    expect(compose.actions).toEqual([
      "prepare",
      "reset",
      "readiness:postgres:1500",
      "start-all:postgres,api",
      "logs",
      "ps",
      "readiness:clear",
      "stop"
    ]);
  });

  it("times out a stalled observer and still cleans up", async () => {
    vi.useFakeTimers();
    const compose = new RecordingCompose();
    const observer: RunObserver = {
      evaluate: () => new Promise<RunResult>(() => undefined)
    };
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer,
      runTimeoutMs: 100
    });

    const run = controller.runSchedule({ id: "stalled", perturbations: [] }, []);
    const assertion = expect(run).resolves.toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(compose.actions.at(-1)).toBe("stop");
    vi.useRealTimers();
  });

  it("starts the measured timeout only after reset preparation finishes", async () => {
    const compose = new SlowResetCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(),
      runTimeoutMs: 5,
    });

    await expect(controller.runSchedule({ id: "prepared", perturbations: [] }, ["api"])).resolves.toMatchObject({ status: "pass" });
  });

  it("aborts observer work before cleanup when the run times out", async () => {
    vi.useFakeTimers();
    const compose = new RecordingCompose();
    let observedSignal: AbortSignal | undefined;
    const observer: RunObserver = {
      evaluate: (snapshot) => {
        observedSignal = snapshot.signal;
        return new Promise<RunResult>(() => undefined);
      },
    };
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer,
      runTimeoutMs: 100,
    });

    const run = controller.runSchedule({ id: "abort-stalled", perturbations: [] }, []);
    const assertion = expect(run).resolves.toMatchObject({ status: "execution_error", diagnostics: [{ code: "run_timeout" }] });
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(observedSignal?.aborted).toBe(true);
    expect(compose.actions.at(-1)).toBe("stop");
    vi.useRealTimers();
  });
});
