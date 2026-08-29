import type { WorkloadEvent } from "../oracle/types.js";

export type LogFailureCategory =
  | "connection_refused"
  | "timeout"
  | "dependency_not_ready";

export type LogFailureEvidence = {
  workload: string;
  category: LogFailureCategory;
  summary: string;
  raw: string;
};

export type ParsedLogEvidence = {
  events: WorkloadEvent[];
  failures: LogFailureEvidence[];
};
