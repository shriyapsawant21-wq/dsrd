export type RunPhase = "queued" | "exploring" | "minimizing" | "completed" | "no_failure" | "target_unhealthy" | "needs_configuration" | "unsupported_target" | "execution_error" | "inconclusive" | "cancelled" | "error";

export type ProgressEvent = {
  runId: string;
  phase: RunPhase;
  percentage: number;
  message: string;
  testedSchedules: number;
  failureCount: number;
  diagnostics?: RunDiagnostic[];
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
import type { RunDiagnostic } from "@dsrd/contracts";
