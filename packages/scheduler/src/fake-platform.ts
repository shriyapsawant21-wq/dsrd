import type { ExecutionPlatform, RunResult, Schedule } from "@dsrd/contracts";

const workloads = [
  { id: "bootstrap", kind: "initializer" as const, perturbablePhases: ["ready" as const] },
  { id: "api", kind: "service" as const, perturbablePhases: ["start" as const] }
];

export const fakePlatform: ExecutionPlatform = {
  discover: async () => workloads,
  reset: async () => undefined,
  run: async (_target, schedule) => fakeRun(schedule),
  replay: async (_target, schedule) => fakeRun(schedule)
};

function fakeRun(schedule: Schedule): RunResult {
  const delayMs = schedule.perturbations.find(
    ({ workloadId, phase }) => workloadId === "bootstrap" && phase === "ready"
  )?.delayMs ?? 0;
  const failed = delayMs >= 1000;

  return {
    scheduleId: schedule.id,
    status: failed ? "fail" : "pass",
    events: failed
      ? [{ timeMs: delayMs, service: "api", event: "startup_failed", detail: "fake platform: bootstrap was not ready" }]
      : [],
    logs: [],
    ...(failed ? { failureReason: "fake platform: bootstrap unavailable" } : {})
  };
}
