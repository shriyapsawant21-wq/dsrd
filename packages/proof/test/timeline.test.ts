import { describe, expect, it } from "vitest";

import { buildTimeline } from "../src/timeline.js";
import type { ObservationSnapshot } from "../src/oracle/types.js";

describe("timeline construction", () => {
  it("normalizes observed timestamps and explains startup ordering", () => {
    const snapshot: ObservationSnapshot = {
      scheduleId: "race-1500",
      startedAtMs: 1_000,
      containers: [
        {
          service: "postgres",
          state: "running",
          observedAtMs: 990,
        },
        { service: "api", state: "running", observedAtMs: 1_020 },
        {
          service: "api",
          state: "exited",
          exitCode: 1,
          observedAtMs: 1_430,
        },
      ],
      readiness: [
        {
          service: "postgres",
          kind: "tcp",
          status: "ready",
          observedAtMs: 2_800,
        },
      ],
      fixtureEvents: [
        {
          timeMs: 420,
          service: "api",
          event: "db_connection_failed",
          detail: "ECONNREFUSED",
        },
      ],
      logFailures: [],
      logs: [],
    };

    expect(buildTimeline(snapshot)).toEqual([
      {
        timeMs: 0,
        service: "postgres",
        event: "container_running",
      },
      { timeMs: 20, service: "api", event: "container_running" },
      {
        timeMs: 420,
        service: "api",
        event: "db_connection_failed",
        detail: "ECONNREFUSED",
      },
      {
        timeMs: 430,
        service: "api",
        event: "container_exited",
        detail: "exit code 1",
      },
      { timeMs: 1_800, service: "postgres", event: "tcp_ready" },
    ]);
  });

  it("sorts equal timestamps by service and event for stable output", () => {
    const snapshot: ObservationSnapshot = {
      scheduleId: "equal-times",
      startedAtMs: 100,
      containers: [],
      readiness: [],
      fixtureEvents: [
        { timeMs: 5, service: "worker", event: "work_succeeded" },
        { timeMs: 5, service: "api", event: "z_event" },
        { timeMs: 5, service: "api", event: "a_event" },
      ],
      logFailures: [],
      logs: [],
    };

    expect(buildTimeline(snapshot).map(({ service, event }) => [service, event])).toEqual([
      ["api", "a_event"],
      ["api", "z_event"],
      ["worker", "work_succeeded"],
    ]);
  });
});
