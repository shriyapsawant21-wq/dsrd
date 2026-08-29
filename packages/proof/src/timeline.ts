import type { TimelineEvent } from "@dsrd/contracts";

import type { ObservationSnapshot } from "./oracle/types.js";

function relativeTime(observedAtMs: number, startedAtMs: number): number {
  return Math.max(0, observedAtMs - startedAtMs);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function buildTimeline(
  snapshot: ObservationSnapshot,
): TimelineEvent[] {
  const containerEvents: TimelineEvent[] = snapshot.containers.map(
    (container) => {
      const event: TimelineEvent = {
        timeMs: relativeTime(container.observedAtMs, snapshot.startedAtMs),
        service: container.service,
        event: `container_${container.state}`,
      };
      if (container.state === "exited" && container.exitCode !== undefined) {
        event.detail = `exit code ${container.exitCode}`;
      }
      return event;
    },
  );

  const readinessEvents: TimelineEvent[] = snapshot.readiness.map(
    (readiness) => {
      const event: TimelineEvent = {
        timeMs: relativeTime(readiness.observedAtMs, snapshot.startedAtMs),
        service: readiness.service,
        event: `${readiness.kind}_${readiness.status}`,
      };
      if (readiness.detail !== undefined) {
        event.detail = readiness.detail;
      }
      return event;
    },
  );

  const fixtureEvents = snapshot.fixtureEvents.map((event) => ({
    ...event,
    timeMs: Math.max(0, event.timeMs),
  }));

  return [...containerEvents, ...readinessEvents, ...fixtureEvents].sort(
    (left, right) =>
      left.timeMs - right.timeMs ||
      compareText(left.service, right.service) ||
      compareText(left.event, right.event),
  );
}
