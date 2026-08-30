export type Progress = { runId: string; phase: string; percentage: number; message: string; testedSchedules: number; failureCount: number };
export type FailureSummary = { id: string; name: string; severity: string; reason: string };
export type RunRecord = { id: string; progress: Progress; failures: FailureSummary[]; error?: string; artifact?: { expectedFailureReason?: string; events: TimelineEvent[] } };
export type TimelineEvent = { timeMs: number; service: string; event: string; detail?: string };
export type FailureDetail = { id: string; reason: string; severity: string; events: TimelineEvent[]; originalSchedule: unknown; minimizedSchedule: unknown };

export async function createRun(file: File): Promise<{ runId: string }> {
  const body = new FormData(); body.append("composeFile", file);
  const response = await fetch("/api/runs", { method: "POST", body });
  if (!response.ok) throw new Error((await response.json()).error ?? "Upload failed");
  return response.json();
}
export function subscribeRun(runId: string, onEvent: (event: Progress) => void, onError: () => void): () => void {
  const source = new EventSource(`/api/runs/${runId}/events`);
  ["progress", "completed", "no_failure", "error"].forEach((name) => source.addEventListener(name, (event) => onEvent(JSON.parse((event as MessageEvent).data))));
  source.onerror = onError; return () => source.close();
}
export async function getRun(runId: string): Promise<RunRecord> { const response = await fetch(`/api/runs/${runId}`); if (!response.ok) throw new Error("Run not found"); return response.json(); }
export async function getFailure(runId: string, failureId: string): Promise<FailureDetail> { const response = await fetch(`/api/runs/${runId}/failures/${failureId}`); if (!response.ok) throw new Error("Failure evidence not found"); return response.json(); }
