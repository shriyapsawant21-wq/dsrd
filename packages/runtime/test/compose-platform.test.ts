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
      { id: "api", dependsOn: ["postgres"] },
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
          api: { depends_on: { postgres: { condition: "service_healthy" } } }
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
    return { scheduleId: schedule.id, status: "pass", events: [], logs: [] };
  }

  async replaySchedule(schedule: { id: string }, services: string[]): Promise<RunResult> {
    this.runs.push({ id: `replay:${schedule.id}`, services });
    return { scheduleId: schedule.id, status: "pass", events: [], logs: [] };
  }
}

describe("ComposeExecutionPlatform", () => {
  it("loads Compose service dependencies from docker compose config", async () => {
    const runner = new ConfigRunner();
    const discovery = new DockerComposeServiceDiscovery({
      projectDirectory: "/workspace/fixture",
      runner
    });

    await expect(discovery.discoverServices(target)).resolves.toEqual([
      { id: "postgres" },
      { id: "api", dependsOn: ["postgres"] }
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
});
