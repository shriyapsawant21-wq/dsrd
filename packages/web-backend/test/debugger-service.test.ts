import type {
  ExecutionPlatform,
  RunResult,
  Schedule,
  TargetConfig,
  Workload
} from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { DebuggerService } from "../src/debugger-service.js";
import type { ScheduleProgress } from "../src/types.js";

const target: TargetConfig = {
  platform: "compose",
  composeFile: "compose.yaml"
};

describe("DebuggerService", () => {
  it("executes generated schedules sequentially and publishes proof-owned results", async () => {
    const platform = new RecordingPlatform();
    const progress: ScheduleProgress[] = [];
    const service = new DebuggerService(() => platform);

    const result = await service.search(
      { target, delayOptionsMs: [0, 1_000] },
      (event) => progress.push(event)
    );

    expect(result.status).toBe("found_failure");
    expect(platform.concurrentExecution).toBe(false);
    expect(platform.runIds).toEqual([
      "schedule-000",
      "schedule-001",
      "schedule-001",
      "schedule-001-minimized"
    ]);
    expect(progress.map(({ type, attempt }) => [type, attempt])).toEqual([
      ["schedule_started", 1],
      ["schedule_completed", 1],
      ["schedule_started", 2],
      ["schedule_completed", 2],
      ["schedule_started", 3],
      ["schedule_completed", 3],
      ["schedule_started", 4],
      ["schedule_completed", 4]
    ]);
    const completed = progress.find(
      (event) => event.type === "schedule_completed" && event.attempt === 2
    );
    expect(completed).toMatchObject({
      result: {
        status: "fail",
        failureReason: "proof: dependency unavailable"
      }
    });
  });

  it("replays through the platform replay boundary", async () => {
    const platform = new RecordingPlatform();
    const service = new DebuggerService(() => platform);
    const artifact = {
      version: 2 as const,
      createdAt: "2026-08-30T00:00:00.000Z",
      target,
      originalSchedule: failingSchedule("original"),
      minimizedSchedule: failingSchedule("minimized"),
      expectedFailureReason: "proof: dependency unavailable",
      events: []
    };

    const result = await service.replay(artifact, () => undefined);

    expect(result.status).toBe("reproduced");
    expect(platform.replayIds).toEqual(["minimized"]);
    expect(platform.runIds).toEqual([]);
  });
});

class RecordingPlatform implements ExecutionPlatform {
  readonly runIds: string[] = [];
  readonly replayIds: string[] = [];
  concurrentExecution = false;
  private active = false;

  async discover(): Promise<Workload[]> {
    return [{
      id: "postgres",
      kind: "service",
      perturbablePhases: ["ready"]
    }];
  }

  async reset(): Promise<void> {}

  async run(_target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    if (this.active) this.concurrentExecution = true;
    this.active = true;
    this.runIds.push(schedule.id);
    await Promise.resolve();
    this.active = false;
    return proofResult(schedule);
  }

  async replay(_target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    this.replayIds.push(schedule.id);
    return proofResult(schedule);
  }
}

function failingSchedule(id: string): Schedule {
  return {
    id,
    perturbations: [{
      workloadId: "postgres",
      phase: "ready",
      delayMs: 1_000
    }]
  };
}

function proofResult(schedule: Schedule): RunResult {
  const failed = schedule.perturbations.some(({ delayMs }) => delayMs >= 1_000);
  return {
    scheduleId: schedule.id,
    status: failed ? "fail" : "pass",
    events: failed
      ? [{ timeMs: 1, service: "api", event: "db_connection_failed" }]
      : [],
    logs: [],
    ...(failed ? { failureReason: "proof: dependency unavailable" } : {})
  };
}
