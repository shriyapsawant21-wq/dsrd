import type { TimelineEvent } from "@dsrd/contracts";
import type { WorkloadObservationSnapshot } from "./oracle/types.js";

function relativeTime(observedAtMs: number, startedAtMs: number): number {
  return Math.max(0, observedAtMs - startedAtMs);
}

export function buildWorkloadTimeline(snapshot: WorkloadObservationSnapshot): TimelineEvent[] {
  const stateEvents: TimelineEvent[] = snapshot.states.map((state) => ({
    timeMs: relativeTime(state.observedAtMs, snapshot.startedAtMs),
    service: state.workload,
    event: `workload_${state.state}`,
    ...(state.state === "exited" && state.exitCode !== undefined
      ? { detail: `exit code ${state.exitCode}` }
      : {}),
  }));
  const readinessEvents: TimelineEvent[] = snapshot.readiness.map((readiness) => ({
    timeMs: relativeTime(readiness.observedAtMs, snapshot.startedAtMs),
    service: readiness.workload,
    event: `${readiness.kind}_${readiness.status}`,
    ...(readiness.detail === undefined ? {} : { detail: readiness.detail }),
  }));
  const workloadEvents: TimelineEvent[] = snapshot.workloadEvents.map(
    ({ workload, ...event }) => ({
      ...event,
      timeMs: Math.max(0, event.timeMs),
      service: workload,
    }),
  );
  return [...stateEvents, ...readinessEvents, ...workloadEvents].sort(
    (left, right) =>
      left.timeMs - right.timeMs ||
      left.service.localeCompare(right.service) ||
      left.event.localeCompare(right.event),
  );
}
