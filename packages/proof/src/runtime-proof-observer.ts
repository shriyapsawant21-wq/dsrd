import type { RunResult } from "@dsrd/contracts";

import { parseLogEvidence } from "./logs/parse.js";
import { evaluateWorkloadRun } from "./oracle/evaluate.js";
import type {
  WorkloadEvent,
  WorkloadObservationSnapshot,
} from "./oracle/types.js";

export type WorkloadExecutionSnapshot = Omit<
  WorkloadObservationSnapshot,
  "workloadEvents" | "logFailures"
> & {
  workloadEvents?: WorkloadEvent[];
  signal?: AbortSignal;
  refresh?: () => Promise<
    Pick<WorkloadExecutionSnapshot, "states" | "readiness" | "logs">
  >;
};

export interface WorkloadRunObserver {
  evaluate(snapshot: WorkloadExecutionSnapshot): Promise<RunResult>;
}

export type WorkloadProofObserverOptions = {
  pollIntervalMs?: number;
};

function hasTerminalFailure(snapshot: WorkloadExecutionSnapshot): boolean {
  return snapshot.states.some(
    ({ state, exitCode }) => state === "exited" && exitCode !== undefined && exitCode !== 0,
  );
}

function waitForNextRefresh(signal: AbortSignal | undefined, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
      return;
    }

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
  });
}

export class WorkloadProofObserver implements WorkloadRunObserver {
  constructor(private readonly options: WorkloadProofObserverOptions = {}) {}

  async evaluate(snapshot: WorkloadExecutionSnapshot): Promise<RunResult> {
    let evidence = snapshot;
    let refreshed = false;
    while (true) {
      snapshot.signal?.throwIfAborted();
      const result = this.classify(evidence);
      if (
        snapshot.refresh === undefined ||
        result.status === "pass" ||
        hasTerminalFailure(evidence)
      ) {
        return result;
      }

      if (refreshed) {
        await waitForNextRefresh(snapshot.signal, this.options.pollIntervalMs ?? 100);
      }
      evidence = {
        ...evidence,
        ...(await snapshot.refresh()),
      };
      refreshed = true;
      snapshot.signal?.throwIfAborted();
    }
  }

  private classify(snapshot: WorkloadExecutionSnapshot): RunResult {
    const parsedLogs = parseLogEvidence(
      snapshot.logs,
      Math.max(0, Date.now() - snapshot.startedAtMs),
      snapshot.workloads.map(({ id }) => id),
    );
    return evaluateWorkloadRun({
      ...snapshot,
      workloadEvents: [...(snapshot.workloadEvents ?? []), ...parsedLogs.events],
      logFailures: parsedLogs.failures,
    });
  }
}
