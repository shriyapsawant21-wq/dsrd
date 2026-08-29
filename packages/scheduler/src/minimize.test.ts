import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { minimizeSchedule } from "./minimize.js";

describe("minimizeSchedule", () => {
  it("removes unnecessary perturbations and lowers necessary delays", async () => {
    const original: Schedule = {
      id: "schedule-003",
      services: {
        postgres: { readinessDelayMs: 1000 },
        api: { startDelayMs: 500 }
      }
    };

    const minimized = await minimizeSchedule(
      original,
      async (schedule) =>
        resultFor(
          schedule,
          (schedule.services.postgres?.readinessDelayMs ?? 0) >= 500
        ),
      [0, 250, 500, 1000]
    );

    expect(minimized).toEqual({
      id: "schedule-003-minimized",
      services: { postgres: { readinessDelayMs: 500 } }
    });
  });
});

function resultFor(schedule: Schedule, fails: boolean): RunResult {
  return {
    scheduleId: schedule.id,
    status: fails ? "fail" : "pass",
    events: [],
    logs: []
  };
}
