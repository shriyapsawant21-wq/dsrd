import type {
  ExecutionPlatform,
  RunResult,
  Schedule,
  TargetConfig,
  Workload
} from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { DebuggerService } from "../src/debugger-service.js";
import { JobManager } from "../src/job-manager.js";

const target: TargetConfig = {
  platform: "compose",
  composeFile: "compose.yaml"
};

describe("JobManager", () => {
  it("allows one active job and retains its failure artifact", async () => {
    const platform = new ControlledPlatform();
    const jobs = new JobManager(new DebuggerService(() => platform));

    const first = jobs.startSearch({
      target,
      delayOptionsMs: [0, 1_000]
    });

    expect(() => jobs.startSearch({
      target,
      delayOptionsMs: [0]
    })).toThrow("Debugger job already active");

    await waitFor(() => jobs.getJob(first.id)?.status === "completed");
    expect(jobs.getJob(first.id)).toMatchObject({
      status: "completed",
      attempts: 4,
      discovery: { status: "found_failure" }
    });
    expect(jobs.artifactFor(first.id)).toMatchObject({
      version: 2,
      target,
      minimizedSchedule: {
        perturbations: [{
          workloadId: "postgres",
          phase: "ready",
          delayMs: 1_000
        }]
      }
    });
    expect(platform.resetCount).toBe(1);
  });

  it("publishes ordered lifecycle and schedule events", async () => {
    const platform = new ControlledPlatform();
    const jobs = new JobManager(
      new DebuggerService(() => platform),
      { now: monotonicNow, createId: () => "job-001" }
    );
    const job = jobs.startSearch({ target, delayOptionsMs: [0, 1_000] });

    await waitFor(() => jobs.getJob(job.id)?.status === "completed");

    const events = jobs.eventsFor(job.id);
    expect(events[0]).toMatchObject({
      type: "job_started",
      jobId: "job-001"
    });
    expect(events.at(-1)).toMatchObject({
      type: "job_completed",
      jobId: "job-001"
    });
    expect(events.map(({ timeMs }) => timeMs).every(
      (timeMs, index, values) => index === 0 || timeMs >= values[index - 1]!
    )).toBe(true);
    expect(events.filter(({ type }) => type === "schedule_started")).toHaveLength(4);
  });

  it("cancels before the next schedule and resets the target", async () => {
    const platform = new ControlledPlatform(true);
    const jobs = new JobManager(new DebuggerService(() => platform));
    const job = jobs.startSearch({ target, delayOptionsMs: [0, 1_000] });

    await platform.firstRunStarted;
    expect(jobs.cancel(job.id).status).toBe("cancel_requested");
    platform.releaseFirstRun();

    await waitFor(() => jobs.getJob(job.id)?.status === "cancelled");
    expect(platform.runIds).toEqual(["schedule-000"]);
    expect(platform.resetCount).toBe(1);
    expect(jobs.eventsFor(job.id).at(-1)?.type).toBe("job_cancelled");
  });
});

class ControlledPlatform implements ExecutionPlatform {
  readonly runIds: string[] = [];
  resetCount = 0;
  readonly firstRunStarted: Promise<void>;
  private signalFirstRunStarted!: () => void;
  private firstRunReleased: Promise<void>;
  private signalFirstRunReleased!: () => void;

  constructor(private readonly holdFirstRun = false) {
    this.firstRunStarted = new Promise((resolve) => {
      this.signalFirstRunStarted = resolve;
    });
    this.firstRunReleased = new Promise((resolve) => {
      this.signalFirstRunReleased = resolve;
    });
  }

  async discover(): Promise<Workload[]> {
    return [{
      id: "postgres",
      kind: "service",
      perturbablePhases: ["ready"]
    }];
  }

  async reset(): Promise<void> {
    this.resetCount += 1;
  }

  async run(_target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    this.runIds.push(schedule.id);
    if (this.runIds.length === 1) {
      this.signalFirstRunStarted();
      if (this.holdFirstRun) await this.firstRunReleased;
    }
    return proofResult(schedule);
  }

  replay(_target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    return Promise.resolve(proofResult(schedule));
  }

  releaseFirstRun(): void {
    this.signalFirstRunReleased();
  }
}

function proofResult(schedule: Schedule): RunResult {
  const failed = schedule.perturbations.some(({ delayMs }) => delayMs >= 1_000);
  return {
    scheduleId: schedule.id,
    status: failed ? "fail" : "pass",
    events: [],
    logs: [],
    ...(failed ? { failureReason: "proof: dependency unavailable" } : {})
  };
}

let clock = 0;
function monotonicNow(): number {
  clock += 1;
  return clock;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for job state");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
