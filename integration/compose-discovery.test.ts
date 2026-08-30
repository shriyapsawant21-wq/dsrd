import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RunResult, Schedule, TargetConfig, Workload } from "../packages/contracts/src/index.js";
import { ComposeProofObserver } from "../packages/proof/src/index.js";
import {
  ComposeExecutionPlatform,
  type ComposeScheduleExecutor,
  DockerComposeClient,
  DockerComposeServiceDiscovery,
  DockerRuntimeController,
  NodeCommandRunner,
  SystemDelay,
} from "../packages/runtime/src/index.js";
import {
  loadFailureArtifact,
  saveFailureArtifact,
} from "../packages/scheduler/src/artifact.js";
import {
  discoverFailure,
  replayFailure,
} from "../packages/scheduler/src/orchestrator.js";
import { afterAll, describe, expect, it } from "vitest";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const target: TargetConfig = {
  platform: "compose",
  composeFile: "fixtures/startup-race/compose.yaml",
};
const runner = new NodeCommandRunner();
const compose = new DockerComposeClient({
  projectDirectory: workspaceRoot,
  composeFile: target.composeFile,
  runner,
});

describe("generic Compose discovery", () => {
  afterAll(async () => {
    await compose.resetStack();
  });

  it("discovers, saves, and replays minimized Compose failure evidence", async () => {
    let workloads: Workload[] = [];
    const controller = new DockerRuntimeController({
      compose,
      delay: new SystemDelay(),
      observer: new ComposeProofObserver(() => workloads),
      runTimeoutMs: 45_000,
    });
    const platform = new ComposeExecutionPlatform({
      discovery: new DockerComposeServiceDiscovery({ projectDirectory: workspaceRoot, runner }),
      executorFor: () => controller,
    });
    workloads = await platform.discover(target);

    const baseline: Schedule = { id: "baseline", perturbations: [] };
    await expect(platform.run(target, baseline)).resolves.toMatchObject({ status: "pass" });

    const result = await discoverFailure({
      target,
      candidates: [
        baseline,
        {
          id: "delay-postgres-start",
          perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 3_000 }],
        },
      ],
      delayOptionsMs: [0, 3_000],
      runSchedule: platform.run.bind(platform),
      createdAt: "2026-08-30T00:00:00.000Z",
    });

    expect(result.status).toBe("found_failure");
    if (result.status === "found_failure") {
      expect(result.artifact.originalSchedule).toEqual({
        id: "delay-postgres-start",
        perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 3_000 }],
      });
      expect(result.artifact.minimizedSchedule.perturbations).toEqual([
        { workloadId: "postgres", phase: "start", delayMs: 3_000 },
      ]);
      expect(result.artifact.minimizedSchedule.perturbations.length).toBeLessThanOrEqual(
        result.artifact.originalSchedule.perturbations.length,
      );

      const delay = result.artifact.events.find(
        (event) => event.service === "postgres" && event.event === "scheduled_start_delay",
      );
      const databaseFailure = result.artifact.events.find(
        (event) => event.service === "api" && event.event === "db_connection_failed",
      );
      expect(delay).toBeDefined();
      expect(databaseFailure).toBeDefined();
      expect(delay?.timeMs).toBeLessThan(databaseFailure?.timeMs ?? Number.POSITIVE_INFINITY);

      const directory = await mkdtemp(join(tmpdir(), "dsrd-compose-replay-"));
      const artifactPath = join(directory, "failure.json");
      try {
        await saveFailureArtifact(artifactPath, result.artifact);
        const savedArtifact = await loadFailureArtifact(artifactPath);
        expect(savedArtifact).toMatchObject({
          version: 2,
          target,
          minimizedSchedule: result.artifact.minimizedSchedule,
        });

        const replayPlatform = new ComposeExecutionPlatform({
          discovery: new DockerComposeServiceDiscovery({ projectDirectory: workspaceRoot, runner }),
          executorFor: () =>
            new ArtifactReplayExecutor(savedArtifact.minimizedSchedule, {
              scheduleId: savedArtifact.minimizedSchedule.id,
              status: "fail",
              failureReason: savedArtifact.expectedFailureReason,
              events: savedArtifact.events,
              logs: savedArtifact.events.map((event) => JSON.stringify(event)),
            }),
        });

        const replay = await replayFailure(savedArtifact, replayPlatform.replay.bind(replayPlatform));
        expect(replay.status).toBe("reproduced");
        expect(replay.result.events).toContainEqual(
          expect.objectContaining({
            service: "postgres",
            event: "scheduled_start_delay",
          }),
        );
        expect(replay.result.events).toContainEqual(
          expect.objectContaining({
            service: "api",
            event: "db_connection_failed",
          }),
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }, 180_000);
});

class ArtifactReplayExecutor implements ComposeScheduleExecutor {
  constructor(
    private readonly expectedSchedule: Schedule,
    private readonly result: RunResult,
  ) {}

  resetStack(): Promise<void> {
    throw new Error("artifact replay test should not reset the real Compose stack");
  }

  runSchedule(): Promise<RunResult> {
    throw new Error("artifact replay test should not execute discovery schedules");
  }

  replaySchedule(schedule: Schedule): Promise<RunResult> {
    expect(schedule).toEqual(this.expectedSchedule);
    return Promise.resolve(this.result);
  }
}
