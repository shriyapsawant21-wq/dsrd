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
};

export interface WorkloadRunObserver {
  evaluate(snapshot: WorkloadExecutionSnapshot): Promise<RunResult>;
}

export class WorkloadProofObserver implements WorkloadRunObserver {
  async evaluate(snapshot: WorkloadExecutionSnapshot): Promise<RunResult> {
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
