export type RunPhase = "queued" | "exploring" | "minimizing" | "completed" | "no_failure" | "error";

export type ProgressEvent = {
  runId: string;
  phase: RunPhase;
  percentage: number;
  message: string;
  testedSchedules: number;
  failureCount: number;
};

export function initialProgress(runId: string): ProgressEvent {
  return {
    runId,
    phase: "queued",
    percentage: 0,
    message: "Run queued",
    testedSchedules: 0,
    failureCount: 0
  };
}
