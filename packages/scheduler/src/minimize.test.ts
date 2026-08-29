import type { RunResult, Schedule } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { minimizeSchedule } from "./minimize.js";

describe("minimizeSchedule", () => {
  it("removes unnecessary perturbations and lowers necessary delays", async () => {
    const original: Schedule = {
      id: "schedule-003",
      perturbations: [
        { workloadId: "bootstrap", phase: "ready", delayMs: 1000 },
        { workloadId: "api", phase: "start", delayMs: 500 }
      ]
    };

    const minimized = await minimizeSchedule(
      original,
      { platform: "local-process", manifestPath: "race.json" },
      async (_target, schedule) =>
        resultFor(
          schedule,
          (schedule.perturbations.find(
            ({ workloadId, phase }) => workloadId === "bootstrap" && phase === "ready"
          )?.delayMs ?? 0) >= 500
        ),
      [0, 250, 500, 1000]
    );

    expect(minimized).toEqual({
      id: "schedule-003-minimized",
      perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 500 }]
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
