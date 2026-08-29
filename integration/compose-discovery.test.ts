import { fileURLToPath } from "node:url";

import type { Schedule, TargetConfig, Workload } from "../packages/contracts/src/index.js";
import { ComposeProofObserver } from "../packages/proof/src/index.js";
import {
  ComposeExecutionPlatform,
  DockerComposeClient,
  DockerComposeServiceDiscovery,
  DockerRuntimeController,
  NodeCommandRunner,
  SystemDelay,
} from "../packages/runtime/src/index.js";
import { discoverFailure } from "../packages/scheduler/src/orchestrator.js";
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

  it("passes normally then discovers the delayed-workload failure with timeline evidence", async () => {
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

      const delay = result.artifact.events.find(
        (event) => event.service === "postgres" && event.event === "scheduled_start_delay",
      );
      const databaseFailure = result.artifact.events.find(
        (event) => event.service === "api" && event.event === "db_connection_failed",
      );
      expect(delay).toBeDefined();
      expect(databaseFailure).toBeDefined();
      expect(delay?.timeMs).toBeLessThan(databaseFailure?.timeMs ?? Number.POSITIVE_INFINITY);
    }
  }, 120_000);
});
