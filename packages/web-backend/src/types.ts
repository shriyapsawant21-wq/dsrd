import type {
  FailureArtifact,
  RunResult,
  Schedule,
  TargetConfig
} from "@dsrd/contracts";
import type { DiscoveryResult, ReplayResult } from "@dsrd/scheduler";

export type SearchRequest = {
  target: TargetConfig;
  delayOptionsMs: number[];
};

export type JobKind = "search" | "replay";
export type JobStatus =
  | "queued"
  | "running"
  | "cancel_requested"
  | "completed"
  | "failed"
  | "cancelled";

export type JobEvent =
  | { type: "job_started"; jobId: string; kind: JobKind; timeMs: number }
  | {
      type: "schedule_started";
      jobId: string;
      attempt: number;
      schedule: Schedule;
      timeMs: number;
    }
  | {
      type: "schedule_completed";
      jobId: string;
      attempt: number;
      scheduleId: string;
      result: RunResult;
      timeMs: number;
    }
  | { type: "job_completed"; jobId: string; timeMs: number }
  | { type: "job_failed"; jobId: string; message: string; timeMs: number }
  | { type: "job_cancelled"; jobId: string; timeMs: number };

export type JobView = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  discovery?: DiscoveryResult;
  replay?: ReplayResult;
  artifact?: FailureArtifact;
  error?: { code: string; message: string };
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNSUPPORTED_PLATFORM"
  | "JOB_ACTIVE"
  | "JOB_NOT_FOUND"
  | "JOB_TERMINAL"
  | "ARTIFACT_NOT_READY"
  | "EXECUTION_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};
