export type WorkerFixtureEvent = {
  service: "worker";
  event: "work_succeeded" | "api_request_failed";
  detail?: string;
};

export type EmitWorkerEvent = (event: WorkerFixtureEvent) => void;

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runWorker(
  fetchImpl: typeof fetch,
  apiUrl: string,
  emit: EmitWorkerEvent,
  timeoutMs = 2_000,
): Promise<void> {
  try {
    const response = await fetchImpl(apiUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      throw new Error(`API returned HTTP ${response.status}`);
    }

    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("status" in body) ||
      body.status !== "processed"
    ) {
      throw new Error("API returned an unexpected response body");
    }

    emit({ service: "worker", event: "work_succeeded" });
  } catch (error) {
    emit({
      service: "worker",
      event: "api_request_failed",
      detail: errorDetail(error),
    });
    throw error;
  }
}
