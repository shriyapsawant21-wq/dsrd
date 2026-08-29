import type {
  Clock,
  ReadinessObservation,
  Sleep,
} from "./types.js";

export type HttpProbeOptions = {
  workload: string;
  url: string;
  timeoutMs: number;
  pollIntervalMs: number;
  fetchImpl?: typeof fetch;
  now?: Clock;
  sleep?: Sleep;
};

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isHealthyBody(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "ok"
  );
}

export async function probeHttpReadiness(
  options: HttpProbeOptions,
): Promise<ReadinessObservation> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = now() + options.timeoutMs;

  while (true) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return {
        workload: options.workload,
        kind: "http",
        status: "timeout",
        observedAtMs: now(),
      };
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await fetchImpl(options.url, {
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }

      if (response.status === 200 && isHealthyBody(body)) {
        return {
          workload: options.workload,
          kind: "http",
          status: "ready",
          observedAtMs: now(),
        };
      }

      return {
        workload: options.workload,
        kind: "http",
        status: "unhealthy",
        observedAtMs: now(),
        detail: "Expected HTTP 200 with { status: 'ok' }",
      };
    } catch {
      // Connection and request errors remain retryable until the deadline.
    } finally {
      clearTimeout(abortTimer);
    }

    const waitMs = Math.min(options.pollIntervalMs, deadline - now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}
