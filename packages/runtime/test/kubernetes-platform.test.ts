import type { RunResult, TargetConfig } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import {
  KubernetesExecutionPlatform,
  KubectlKubernetesExecutor,
  KubectlKubernetesResourceDiscovery,
  type CommandInvocation,
  type CommandResult,
  type CommandRunner,
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

class RecordingRunner implements CommandRunner {
  readonly invocations: CommandInvocation[] = [];

  async run(invocation: CommandInvocation): Promise<CommandResult> {
    this.invocations.push(invocation);
    return { stdout: "", stderr: "", exitCode: 0 };
  }
}

describe("KubectlKubernetesExecutor", () => {
  it("resets manifest-scoped resources and applies each workload separately through kubectl", async () => {
    const runner = new RecordingRunner();
    const executor = new KubectlKubernetesExecutor({
      target: { platform: "kubernetes", manifestPath: "fixture.yaml", namespace: "race-debugger" },
      runner,
      evaluate: async (scheduleId) => ({ scheduleId, status: "pass", events: [], logs: [] }),
    });

    await executor.resetNamespace();
    await executor.runSchedule({
      id: "delay-api",
      perturbations: [{ workloadId: "api", phase: "start", delayMs: 1 }],
    }, ["api", "postgres", "migrate"]);

    expect(runner.invocations).toEqual([
      { command: "kubectl", args: ["delete", "--ignore-not-found", "--wait=true", "-f", "fixture.yaml", "--namespace", "race-debugger"], cwd: process.cwd() },
      { command: "kubectl", args: ["delete", "--ignore-not-found", "--wait=true", "-f", "fixture.yaml", "--namespace", "race-debugger"], cwd: process.cwd() },
      { command: "kubectl", args: ["apply", "-f", "fixture.yaml", "-l", "dsrd.infrastructure=namespace", "--namespace", "race-debugger"], cwd: process.cwd() },
      { command: "kubectl", args: ["apply", "-f", "fixture.yaml", "-l", "dsrd.workload=api", "--namespace", "race-debugger"], cwd: process.cwd() },
      { command: "kubectl", args: ["apply", "-f", "fixture.yaml", "-l", "dsrd.workload=postgres", "--namespace", "race-debugger"], cwd: process.cwd() },
      { command: "kubectl", args: ["apply", "-f", "fixture.yaml", "-l", "dsrd.workload=migrate", "--namespace", "race-debugger"], cwd: process.cwd() },
    ]);
  });
});

describe("KubectlKubernetesResourceDiscovery", () => {
  it("normalizes kubectl dry-run output without contacting a cluster", async () => {
    const runner = new RecordingRunner();
    runner.run = async (invocation) => {
      runner.invocations.push(invocation);
      return {
        stdout: JSON.stringify({ items: [
          { kind: "Deployment", metadata: { name: "api" } },
          { kind: "StatefulSet", metadata: { name: "database" } },
          { kind: "Job", metadata: { name: "migrate" } },
          { kind: "Service", metadata: { name: "ignored" } },
        ] }),
        stderr: "",
        exitCode: 0,
      };
    };
    const discovery = new KubectlKubernetesResourceDiscovery({ runner });

    await expect(discovery.discoverResources(target)).resolves.toEqual([
      { name: "api", kind: "Deployment" },
      { name: "database", kind: "StatefulSet" },
      { name: "migrate", kind: "Job" },
    ]);
    expect(runner.invocations).toEqual([{
      command: "kubectl",
      args: ["create", "--dry-run=client", "-f", "fixture.yaml", "-o", "json", "--namespace", "race-debugger"],
      cwd: process.cwd(),
    }]);
  });
});
