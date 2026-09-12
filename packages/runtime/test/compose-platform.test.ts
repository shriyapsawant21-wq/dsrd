import type { RunResult, TargetConfig } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import {
  ComposeExecutionPlatform,
  DockerComposeServiceDiscovery,
  type CommandInvocation,
  type CommandResult,
  type CommandRunner,
  type ComposeScheduleExecutor,
  type ComposeServiceDiscovery
} from "../src/index.js";

const target: TargetConfig = { platform: "compose", composeFile: "fixture.yml" };

class RecordingDiscovery implements ComposeServiceDiscovery {
  async discoverServices() {
    return [
      { id: "postgres" },
      {
        id: "api",
        dependsOn: ["postgres"],
        dependencyEdges: [{
          workloadId: "postgres",
          condition: "service_started" as const,
          provenance: "declared" as const,
        }],
      },
      { id: "worker", kind: "job" as const },
    ];
  }
}

class ConfigRunner implements CommandRunner {
  invocation?: CommandInvocation;

  async run(invocation: CommandInvocation): Promise<CommandResult> {
    this.invocation = invocation;
    return {
      stdout: JSON.stringify({
        services: {
          postgres: {},
          api: { depends_on: { postgres: { condition: "service_healthy" } } },
          worker: { depends_on: ["api"] },
        }
      }),
      stderr: "",
      exitCode: 0
    };
  }
}

class RecordingExecutor implements ComposeScheduleExecutor {
  readonly runs: Array<{ id: string; services: string[] }> = [];
  resets = 0;

  async resetStack(): Promise<void> {
    this.resets += 1;
  }

  async runSchedule(schedule: { id: string }, services: string[]): Promise<RunResult> {
    this.runs.push({ id: schedule.id, services });
    return { scheduleId: schedule.id, status: "healthy", events: [], logs: [] };
  }

  async replaySchedule(schedule: { id: string }, services: string[]): Promise<RunResult> {
    this.runs.push({ id: `replay:${schedule.id}`, services });
    return { scheduleId: schedule.id, status: "healthy", events: [], logs: [] };
  }
}

describe("ComposeExecutionPlatform", () => {
  it("rejects Compose configurations that declare external volumes", async () => {
    const runner: CommandRunner = {
      async run() {
        return {
          stdout: JSON.stringify({
            services: { api: { volumes: ["shared-data:/var/lib/app"] } },
            volumes: { "shared-data": { external: true } },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    };
    const discovery = new DockerComposeServiceDiscovery({ projectDirectory: "/workspace/fixture", runner });

    await expect(discovery.discoverServices(target)).rejects.toThrow(
      "Compose configuration declares external volumes: shared-data",
    );
  });

  it("loads Compose service dependencies from docker compose config", async () => {
    const runner = new ConfigRunner();
    const discovery = new DockerComposeServiceDiscovery({
      projectDirectory: "/workspace/fixture",
      runner
    });

    await expect(discovery.discoverServices(target)).resolves.toEqual([
      { id: "postgres" },
      {
        id: "api",
        dependsOn: ["postgres"],
        dependencyEdges: [{
          workloadId: "postgres",
          condition: "service_healthy",
          provenance: "declared",
        }],
      },
      {
        id: "worker",
        dependsOn: ["api"],
        dependencyEdges: [{
          workloadId: "api",
          condition: "service_started",
          provenance: "declared",
        }],
      },
    ]);
    expect(runner.invocation).toEqual({
      command: "docker",
      args: ["compose", "-f", "fixture.yml", "config", "--format", "json"],
      cwd: "/workspace/fixture"
    });
  });

  it("discovers Compose services as start-perturbable workloads", async () => {
    const executor = new RecordingExecutor();
    const platform = new ComposeExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: () => executor
    });

    await expect(platform.discover(target)).resolves.toEqual([
      { id: "postgres", kind: "service", perturbablePhases: ["start"] },
      {
        id: "api",
        kind: "service",
        dependsOn: ["postgres"],
        dependencyEdges: [{
          workloadId: "postgres",
          condition: "service_started",
          provenance: "declared",
        }],
        perturbablePhases: ["start"]
      },
      { id: "worker", kind: "job", perturbablePhases: ["start"] },
    ]);
  });

  it("waits for the Compose reset before resolving", async () => {
    let releaseReset: (() => void) | undefined;
    const resetComplete = new Promise<void>((resolve) => {
      releaseReset = resolve;
    });
    const executor = new RecordingExecutor();
    executor.resetStack = async () => resetComplete;
    const platform = new ComposeExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: () => executor
    });
    let settled = false;
    const reset = platform.reset(target).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    releaseReset?.();
    await reset;
  });

  it("runs and replays generic schedules through the existing Compose executor", async () => {
    const executor = new RecordingExecutor();
    const platform = new ComposeExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: () => executor,
      supportsReadinessDelay: true
    });
    const schedule = {
      id: "s1",
      perturbations: [{ workloadId: "api", phase: "start" as const, delayMs: 25 }]
    };

    await expect(platform.run(target, schedule)).resolves.toMatchObject({ scheduleId: "s1" });
    await expect(platform.replay(target, schedule)).resolves.toMatchObject({ scheduleId: "s1" });

    expect(executor.runs).toEqual([
      { id: "s1", services: ["postgres", "api", "worker"] },
      { id: "replay:s1", services: ["postgres", "api", "worker"] }
    ]);
  });

  it("allocates a fresh opaque attempt ID for each execution of the same schedule", async () => {
    const executor = new RecordingExecutor();
    const attemptIds: string[] = [];
    const platform = new ComposeExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: (_target, attemptId) => {
        attemptIds.push(attemptId ?? "");
        return executor;
      },
    });
    const schedule = { id: "repeatable-schedule", perturbations: [] };

    await platform.run(target, schedule);
    await platform.run(target, schedule);
    await platform.replay(target, schedule);

    expect(attemptIds).toHaveLength(3);
    expect(new Set(attemptIds).size).toBe(3);
    expect(attemptIds).not.toContain(schedule.id);
  });

  it("rejects readiness perturbations unless the platform exposes that capability", async () => {
    const executor = new RecordingExecutor();
    const platform = new ComposeExecutionPlatform({
      discovery: new RecordingDiscovery(),
      executorFor: () => executor,
    });
    const schedule = {
      id: "ready-s1",
      perturbations: [{ workloadId: "api", phase: "ready" as const, delayMs: 25 }],
    };

    await expect(platform.run(target, schedule)).rejects.toThrow(
      "Unsupported Compose phase ready for api",
    );
  });
});
