export type Progress = { runId: string; phase: string; percentage: number; message: string; testedSchedules: number; failureCount: number };
export type FailureSummary = { id: string; name: string; severity: string; reason: string };
export type RunRecord = { id: string; progress: Progress; failures: FailureSummary[]; error?: string; artifact?: { expectedFailureReason?: string; events: TimelineEvent[] } };
export type TimelineEvent = { timeMs: number; service: string; event: string; detail?: string };
export type FailureDetail = { id: string; reason: string; severity: string; events: TimelineEvent[]; originalSchedule: unknown; minimizedSchedule: unknown };

type FolderFile = File & { webkitRelativePath?: string };
export type ProjectPlatform = "compose" | "local-process";

export function detectProjectPlatforms(files: Iterable<File>): ProjectPlatform[] {
  const names = [...files].map((file) => ((file as FolderFile).webkitRelativePath || file.name).split(/[\\/]/).at(-1)?.toLowerCase());
  const platforms: ProjectPlatform[] = [];
  if (names.includes("manifest.json")) platforms.push("local-process");
  if (names.some((name) => name === "compose.yaml" || name === "compose.yml" || name === "docker-compose.yaml" || name === "docker-compose.yml")) platforms.push("compose");
  return platforms;
}

export async function createRun(files: Iterable<File>, platform?: ProjectPlatform): Promise<{ runId: string }> {
  const selected = [...files];
  const paths = selected.map((file) => (file as FolderFile).webkitRelativePath || file.name);
  const body = new FormData();
  body.append("relativePaths", JSON.stringify(paths));
  if (platform) body.append("platform", platform);
  selected.forEach((file) => body.append("projectFiles", file));
  const response = await fetch("/api/runs", { method: "POST", body });
  if (!response.ok) {
    const responseText = await response.text();
    try {
      const error = JSON.parse(responseText) as { error?: unknown };
      if (typeof error.error === "string") throw new Error(error.error);
    } catch (error) {
      if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
    }
    throw new Error("UPLOAD_API_UNAVAILABLE");
  }
  return response.json();
}
export function subscribeRun(runId: string, onEvent: (event: Progress) => void, onError: () => void): () => void {
  const source = new EventSource(`/api/runs/${runId}/events`);
  ["progress", "completed", "no_failure", "error"].forEach((name) => source.addEventListener(name, (event) => onEvent(JSON.parse((event as MessageEvent).data))));
  source.onerror = onError; return () => source.close();
}
export async function getRun(runId: string): Promise<RunRecord> { const response = await fetch(`/api/runs/${runId}`); if (!response.ok) throw new Error("Run not found"); return response.json(); }
export async function getFailure(runId: string, failureId: string): Promise<FailureDetail> { const response = await fetch(`/api/runs/${runId}/failures/${failureId}`); if (!response.ok) throw new Error("Failure evidence not found"); return response.json(); }
