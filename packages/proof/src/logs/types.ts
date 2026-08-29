import type { TimelineEvent } from "@dsrd/contracts";

export type LogFailureCategory =
  | "connection_refused"
  | "timeout"
  | "dependency_not_ready";

export type LogFailureEvidence = {
  service: string;
  category: LogFailureCategory;
  summary: string;
  raw: string;
};

export type ParsedLogEvidence = {
  events: TimelineEvent[];
  failures: LogFailureEvidence[];
};
