import type { RunResult, Schedule } from "@dsrd/contracts";

import type { Delay } from "./delay.js";
import { validateDelayMs } from "./delay.js";
import type {
  ComposeServiceState,
  ObservationSnapshot,
  RunObserver
} from "./observer.js";
import type { ReadinessDelayAdapter } from "./readiness-delay.js";

export interface ComposeRuntime {
  resetStack(): Promise<void>;
  startService(service: string, signal?: AbortSignal): Promise<void>;
  collectLogs(): Promise<string[]>;
  listServices(): Promise<ComposeServiceState[]>;
  stopStack(): Promise<void>;
}

export type DockerRuntimeControllerOptions = {
  compose: ComposeRuntime;
  delay: Delay;
  observer: RunObserver;
  readinessDelay?: ReadinessDelayAdapter;
  runTimeoutMs?: number;
};

export class RunTimeoutError extends Error {
  constructor(
    readonly scheduleId: string,
    readonly timeoutMs: number
  ) {
    super(`Schedule ${scheduleId} timed out after ${timeoutMs}ms`);
    this.name = "RunTimeoutError";
  }
}

export class DockerRuntimeController {
  constructor(private readonly options: DockerRuntimeControllerOptions) {}

  async runSchedule(schedule: Schedule, serviceOrder: string[]): Promise<RunResult> {
    this.validateSchedule(schedule, serviceOrder);
    const timeoutMs = this.options.runTimeoutMs ?? 30_000;
    validateDelayMs(timeoutMs, "runTimeoutMs");
    if (timeoutMs === 0) {
      throw new RangeError("runTimeoutMs must be greater than zero");
    }

    let result: RunResult | undefined;
    let runFailure: unknown;
    const observationAbort = new AbortController();
    try {
      result = await this.withTimeout(
        this.executeSchedule(schedule, serviceOrder, observationAbort.signal),
        schedule.id,
        timeoutMs,
        () => observationAbort.abort(),
      );
    } catch (error) {
      runFailure = error;
    }
    observationAbort.abort();

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
  ): Promise<RunResult> {
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
    for (const service of serviceOrder) {
      const startDelayMs = startDelays.get(service) ?? 0;
      await this.options.delay.wait(startDelayMs);
      await this.options.compose.startService(service, signal);
    }

    const snapshot: ObservationSnapshot = {
      scheduleId: schedule.id,
      logs: await this.options.compose.collectLogs(),
      services: await this.options.compose.listServices(),
      signal,
      refresh: async () => ({
        logs: await this.options.compose.collectLogs(),
        services: await this.options.compose.listServices()
      })
    };
    return this.options.observer.evaluate(snapshot);
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
