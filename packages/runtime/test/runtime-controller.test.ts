import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  DockerRuntimeController,
  RunTimeoutError,
  type ComposeRuntime,
  type Delay,
  type ObservationSnapshot,
  type ReadinessDelayAdapter,
  type RunObserver
} from "../src/index.js";

const passingResult: RunResult = {
  scheduleId: "schedule-1",
  status: "pass",
  events: [],
  logs: []
};

class RecordingCompose implements ComposeRuntime {
  readonly actions: string[] = [];
  failStartFor?: string;
  failStop = false;

  async resetStack(): Promise<void> {
    this.actions.push("reset");
  }

  async startService(service: string): Promise<void> {
    this.actions.push(`start:${service}`);
    if (service === this.failStartFor) {
      throw new Error(`cannot start ${service}`);
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

const schedule: Schedule = {
  id: "schedule-1",
  perturbations: [
    { workloadId: "postgres", phase: "start", delayMs: 100 },
    { workloadId: "worker", phase: "start", delayMs: 25 }
  ]
};

describe("DockerRuntimeController", () => {
  it("resets, starts services in schedule order, observes, and cleans up", async () => {
    const compose = new RecordingCompose();
    const delay = new RecordingDelay(compose.actions);
    const observer = new RecordingObserver();
    const controller = new DockerRuntimeController({ compose, delay, observer });

    const result = await controller.runSchedule(schedule, ["postgres", "api", "worker"]);

    expect(result).toEqual(passingResult);
    expect(compose.actions).toEqual([
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
    }, ["api", "postgres"])).rejects.toThrow("cannot start api");

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
    }, ["postgres"])).rejects.toBeInstanceOf(RunTimeoutError);

    delay.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compose.actions).not.toContain("start:postgres");
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

    await expect(controller.runSchedule(schedule, ["postgres", "api", "worker"])).rejects.toThrow("cannot start api");
    expect(compose.actions.at(-1)).toBe("stop");
  });

  it("stops the stack when the observer fails", async () => {
    const compose = new RecordingCompose();
    const controller = new DockerRuntimeController({
      compose,
      delay: new RecordingDelay(compose.actions),
      observer: new RecordingObserver(passingResult, new Error("oracle unavailable"))
    });

    await expect(controller.runSchedule(schedule, ["postgres", "api", "worker"])).rejects.toThrow("oracle unavailable");
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

    const failure = await controller.runSchedule(schedule, ["postgres", "api", "worker"]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "cannot start api" }),
      expect.objectContaining({ message: "cleanup failed" })
    ]);
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
      "reset",
      "readiness:postgres:1500",
      "wait:0",
      "start:postgres",
      "wait:0",
      "start:api",
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
    const assertion = expect(run).rejects.toThrow("Schedule stalled timed out after 100ms");
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(compose.actions.at(-1)).toBe("stop");
    vi.useRealTimers();
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
    const assertion = expect(run).rejects.toThrow(
      "Schedule abort-stalled timed out after 100ms",
    );
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(observedSignal?.aborted).toBe(true);
    expect(compose.actions.at(-1)).toBe("stop");
    vi.useRealTimers();
  });
});
