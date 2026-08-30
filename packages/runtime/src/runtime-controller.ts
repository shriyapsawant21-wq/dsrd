import type { RunResult, Schedule } from "@dsrd/contracts";

import type { Delay } from "./delay.js";
import { validateDelayMs } from "./delay.js";
import type {
  ComposeServiceState,
  ObservationSnapshot,
  RunObserver
} from "./observer.js";
import type { ReadinessDelayAdapter } from "./readiness-delay.js";
import type { StartDelayGate } from "./start-delay-gate.js";

export interface ComposeRuntime {
  resetStack(): Promise<void>;
  startService(
    service: string,
    options?: { includeDependencies?: boolean; signal?: AbortSignal },
  ): Promise<void>;
  collectLogs(signal?: AbortSignal): Promise<string[]>;
  listServices(signal?: AbortSignal): Promise<ComposeServiceState[]>;
  stopStack(): Promise<void>;
}

export type DockerRuntimeControllerOptions = {
  compose: ComposeRuntime;
  delay: Delay;
  observer: RunObserver;
  readinessDelay?: ReadinessDelayAdapter;
  startDelayGate?: StartDelayGate;
  runTimeoutMs?: number;
  operationDrainTimeoutMs?: number;
};

interface ComposeOperationTracker {
  readonly inFlight: Set<Promise<unknown>>;
}

export class RunTimeoutError extends Error {
  constructor(
    readonly scheduleId: string,
    readonly timeoutMs: number
  ) {
    super(`Schedule ${scheduleId} timed out after ${timeoutMs}ms`);
    this.name = "RunTimeoutError";
  }
}

export class ComposeOperationDrainTimeoutError extends Error {
  constructor(readonly scheduleId: string, readonly timeoutMs: number) {
    super(`Compose operations for schedule ${scheduleId} did not settle after ${timeoutMs}ms`);
    this.name = "ComposeOperationDrainTimeoutError";
  }
}

export class DockerRuntimeController {
  constructor(private readonly options: DockerRuntimeControllerOptions) {}

  async runSchedule(schedule: Schedule, serviceOrder: string[]): Promise<RunResult> {
    this.validateSchedule(schedule, serviceOrder);
    const timeoutMs = this.options.runTimeoutMs ?? 30_000;
    const operationDrainTimeoutMs = this.options.operationDrainTimeoutMs ?? 1_000;
    validateDelayMs(timeoutMs, "runTimeoutMs");
    validateDelayMs(operationDrainTimeoutMs, "operationDrainTimeoutMs");
    if (timeoutMs === 0) {
      throw new RangeError("runTimeoutMs must be greater than zero");
    }

    let result: RunResult | undefined;
    let runFailure: unknown;
    const observationAbort = new AbortController();
    const operations: ComposeOperationTracker = { inFlight: new Set() };
    const execution = this.executeSchedule(
      schedule,
      serviceOrder,
      observationAbort.signal,
      operations,
    );
    try {
      result = await this.withTimeout(
        execution,
        schedule.id,
        timeoutMs,
        () => observationAbort.abort(),
      );
    } catch (error) {
      runFailure = error;
    }
    observationAbort.abort();
    try {
      await this.drainComposeOperations(operations, schedule.id, operationDrainTimeoutMs);
    } catch (drainFailure) {
      if (runFailure !== undefined) {
        throw new AggregateError(
          [runFailure, drainFailure],
          `Schedule ${schedule.id} failed and Compose cleanup was skipped`,
        );
      }
      throw drainFailure;
    }

    try {
      await this.cleanup();
    } catch (cleanupFailure) {
      if (runFailure !== undefined) {
        throw new AggregateError(
          [runFailure, cleanupFailure],
          `Schedule ${schedule.id} failed and cleanup also failed`
        );
      }
      throw cleanupFailure;
    }

    if (runFailure !== undefined) {
      throw runFailure;
    }
    return result as RunResult;
  }

  stopStack(): Promise<void> {
    return this.options.compose.stopStack();
  }

  resetStack(): Promise<void> {
    return this.options.compose.resetStack();
  }

  replaySchedule(schedule: Schedule, serviceOrder: string[]): Promise<RunResult> {
    return this.runSchedule(schedule, serviceOrder);
  }

  private async executeSchedule(
    schedule: Schedule,
    serviceOrder: string[],
    signal: AbortSignal,
    operations: ComposeOperationTracker,
  ): Promise<RunResult> {
    const startedAtMs = Date.now();
    await this.options.compose.resetStack();
    for (const perturbation of schedule.perturbations) {
      if (perturbation.phase === "ready") {
        await this.options.readinessDelay?.apply(perturbation.workloadId, perturbation.delayMs);
      }
    }
    const startDelays = new Map(
      schedule.perturbations
        .filter((perturbation) => perturbation.phase === "start")
        .map((perturbation) => [perturbation.workloadId, perturbation.delayMs])
    );
    const independentlyScheduled = [...startDelays.values()].some((delayMs) => delayMs > 0);
    signal.throwIfAborted();
    if (independentlyScheduled) {
      const starts = this.trackComposeOperation(
        operations,
        this.startIndependently(serviceOrder, startDelays, signal),
      );
      await starts;
    } else {
      for (const service of serviceOrder) {
        signal.throwIfAborted();
        await this.options.delay.wait(0);
        signal.throwIfAborted();
        const start = this.trackComposeOperation(
          operations,
          this.options.compose.startService(service, { signal }),
        );
        await start;
      }
    }

    signal.throwIfAborted();
    const logs = await this.trackComposeOperation(
      operations,
      this.options.compose.collectLogs(signal),
    );
    signal.throwIfAborted();
    const services = await this.trackComposeOperation(
      operations,
      this.options.compose.listServices(signal),
    );
    signal.throwIfAborted();

    const snapshot: ObservationSnapshot = {
      scheduleId: schedule.id,
      startedAtMs,
      logs,
      services,
      events: schedule.perturbations
        .filter((perturbation) => perturbation.phase === "start" && perturbation.delayMs > 0)
        .map((perturbation) => ({
          timeMs: 0,
          service: perturbation.workloadId,
          event: "scheduled_start_delay",
          detail: `${perturbation.delayMs}ms`,
        })),
      signal,
      refresh: async () => {
        signal.throwIfAborted();
        const refreshedLogs = await this.trackComposeOperation(
          operations,
          this.options.compose.collectLogs(signal),
        );
        signal.throwIfAborted();
        const refreshedServices = await this.trackComposeOperation(
          operations,
          this.options.compose.listServices(signal),
        );
        signal.throwIfAborted();
        return { logs: refreshedLogs, services: refreshedServices };
      }
    };
    return this.options.observer.evaluate(snapshot);
  }

  private trackComposeOperation<T>(
    tracker: ComposeOperationTracker,
    operation: Promise<T>,
  ): Promise<T> {
    let tracked: Promise<T>;
    tracked = operation.finally(() => tracker.inFlight.delete(tracked));
    tracker.inFlight.add(tracked);
    return tracked;
  }

  private async drainComposeOperations(
    tracker: ComposeOperationTracker,
    scheduleId: string,
    timeoutMs: number,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const drain = Promise.allSettled([...tracker.inFlight]).then(() => undefined);
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new ComposeOperationDrainTimeoutError(scheduleId, timeoutMs)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([drain, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async startIndependently(
    serviceOrder: string[],
    startDelays: ReadonlyMap<string, number>,
    signal: AbortSignal,
  ): Promise<void> {
    const cancellation = new AbortController();
    const cancelForRunAbort = () => cancellation.abort(signal.reason);
    if (signal.aborted) {
      cancelForRunAbort();
    } else {
      signal.addEventListener("abort", cancelForRunAbort, { once: true });
    }
    const starts = serviceOrder.map(async (service) => {
      const delayMs = startDelays.get(service) ?? 0;
      if (delayMs > 0 && this.options.startDelayGate !== undefined) {
        await this.options.startDelayGate.wait(service, cancellation.signal);
      }
      await this.waitForDelay(delayMs, cancellation.signal);
      cancellation.signal.throwIfAborted();
      await this.options.compose.startService(service, {
        includeDependencies: false,
        signal: cancellation.signal,
      });
    });

    try {
      await Promise.all(starts);
    } catch (error) {
      cancellation.abort(error);
      await Promise.allSettled(starts);
      throw error;
    } finally {
      signal.removeEventListener("abort", cancelForRunAbort);
    }
  }

  private async waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.options.delay.wait(delayMs).then(
        () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    scheduleId: string,
    timeoutMs: number,
    onTimeout: () => void,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new RunTimeoutError(scheduleId, timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private async cleanup(): Promise<void> {
    const failures: unknown[] = [];
    try {
      await this.options.readinessDelay?.clear();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.options.compose.stopStack();
    } catch (error) {
      failures.push(error);
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, "Multiple runtime cleanup operations failed");
    }
  }

  private validateSchedule(schedule: Schedule, serviceOrder: string[]): void {
    const knownServices = new Set(serviceOrder);
    const perturbationKeys = new Set<string>();
    const hasReadinessDelay = schedule.perturbations.some(
      (perturbation) => perturbation.phase === "ready"
    );
    if (hasReadinessDelay && this.options.readinessDelay === undefined) {
      throw new Error("ready perturbations require a readiness delay adapter");
    }

    for (const perturbation of schedule.perturbations) {
      if (!knownServices.has(perturbation.workloadId)) {
        throw new Error(`Unknown Compose service: ${perturbation.workloadId}`);
      }
      const key = `${perturbation.workloadId}:${perturbation.phase}`;
      if (perturbationKeys.has(key)) {
        throw new Error(`Duplicate perturbation for ${perturbation.workloadId} ${perturbation.phase}`);
      }
      perturbationKeys.add(key);
      validateDelayMs(
        perturbation.delayMs,
        `${perturbation.workloadId}.${perturbation.phase} delayMs`
      );
    }
  }
}
