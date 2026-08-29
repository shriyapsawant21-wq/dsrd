import type { Workload } from "@dsrd/contracts";
import type { LogFailureEvidence } from "../logs/types.js";
import type { ReadinessObservation } from "../probes/types.js";

export type WorkloadStateObservation = {
  workload: string;
  state: "running" | "exited" | "missing";
  exitCode?: number;
  health?: string;
  observedAtMs: number;
};

export type WorkloadEvent = {
  timeMs: number;
  workload: string;
  event: string;
  detail?: string;
};

export type WorkloadObservationSnapshot = {
  scheduleId: string;
  startedAtMs: number;
  workloads: Workload[];
  states: WorkloadStateObservation[];
  readiness: ReadinessObservation[];
  workloadEvents: WorkloadEvent[];
  logFailures: LogFailureEvidence[];
  logs: string[];
};
