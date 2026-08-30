import type { RunResult, TargetConfig } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import {
  KubernetesExecutionPlatform,
  type KubernetesResourceDiscovery,
  type KubernetesScheduleExecutor,
} from "../src/index.js";

const target: TargetConfig = {
  platform: "kubernetes",
  manifestPath: "fixture.yaml",
  namespace: "race-debugger",
};

class RecordingDiscovery implements KubernetesResourceDiscovery {
  async discoverResources() {
    return [
      { name: "api", kind: "Deployment" },
      { name: "postgres", kind: "StatefulSet" },
      { name: "migrate", kind: "Job" },
    ];
  }
}

class RecordingExecutor implements KubernetesScheduleExecutor {
  resets = 0;
  readonly runs: Array<{ id: string; workloads: string[] }> = [];

  async resetNamespace(): Promise<void> {
    this.resets += 1;
  }

  async runSchedule(schedule: { id: string }, workloads: string[]): Promise<RunResult> {
    this.runs.push({ id: schedule.id, workloads });
    return { scheduleId: schedule.id, status: "pass", events: [], logs: [] };
  }

  async replaySchedule(schedule: { id: string }, workloads: string[]): Promise<RunResult> {
    this.runs.push({ id: `replay:${schedule.id}`, workloads });
    return { scheduleId: schedule.id, status: "pass", events: [], logs: [] };
  }
}

describe("KubernetesExecutionPlatform", () => {
  it("discovers Deployments, StatefulSets, and Jobs as start-perturbable workloads", async () => {
    const platform = new KubernetesExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: () => new RecordingExecutor(),
    });

    await expect(platform.discover(target)).resolves.toEqual([
      { id: "api", kind: "service", perturbablePhases: ["start"] },
      { id: "postgres", kind: "service", perturbablePhases: ["start"] },
      { id: "migrate", kind: "job", perturbablePhases: ["start"] },
    ]);
  });

  it("resets, runs, and replays validated schedules through the Kubernetes executor", async () => {
    const executor = new RecordingExecutor();
    const platform = new KubernetesExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: () => executor,
    });
    const schedule = {
      id: "delayed-api",
      perturbations: [{ workloadId: "api", phase: "start" as const, delayMs: 25 }],
    };

    await platform.reset(target);
    await expect(platform.run(target, schedule)).resolves.toMatchObject({ scheduleId: "delayed-api" });
    await expect(platform.replay(target, schedule)).resolves.toMatchObject({ scheduleId: "delayed-api" });
    await expect(platform.run(target, {
      id: "unsupported-ready-delay",
      perturbations: [{ workloadId: "migrate", phase: "ready", delayMs: 25 }],
    })).rejects.toThrow("Unsupported Kubernetes phase ready for migrate");

    expect(executor.resets).toBe(1);
    expect(executor.runs).toEqual([
      { id: "delayed-api", workloads: ["api", "postgres", "migrate"] },
      { id: "replay:delayed-api", workloads: ["api", "postgres", "migrate"] },
    ]);
  });
});
