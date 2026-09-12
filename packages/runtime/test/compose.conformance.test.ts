import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TargetConfig, Workload } from "@dsrd/contracts";
import { ComposeProofObserver } from "@dsrd/proof";

import {
  ComposeExecutionPlatform,
  DockerComposeClient,
  DockerComposeServiceDiscovery,
  DockerRuntimeController,
  NodeCommandRunner,
  SystemDelay,
  type StartDelayGate,
} from "../src/index.js";

const dockerAvailable = (() => {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const describeDocker = dockerAvailable && process.env.DSRD_DOCKER_CONFORMANCE === "1" ? describe : describe.skip;
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const target: TargetConfig = {
  platform: "compose",
  composeFile: fileURLToPath(new URL("../../../fixtures/startup-race/compose.yaml", import.meta.url)),
};
const runner = new NodeCommandRunner();

class ApiDatabaseAttemptGate implements StartDelayGate {
  constructor(private readonly compose: DockerComposeClient) {}

  async wait(service: string, signal: AbortSignal): Promise<void> {
    if (service !== "postgres") return;
    while (true) {
      signal.throwIfAborted();
      if ((await this.compose.collectLogs(signal)).some((line) =>
        line.includes('"service":"api"') && line.includes('"event":"db_connection_attempted"'),
      )) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
}

describeDocker("Compose conformance", () => {
  it("uses fresh projects, detects the fixture race, and removes attempt-owned resources", async () => {
    let workloads: Workload[] = [];
    const projects: string[] = [];
    const platform = new ComposeExecutionPlatform({
      discovery: new DockerComposeServiceDiscovery({ projectDirectory: workspaceRoot, runner }),
      executorFor: (composeTarget, attemptId = "reset") => {
        const projectName = `dsrd-conformance-${createHash("sha256").update(attemptId).digest("hex").slice(0, 16)}`;
        projects.push(projectName);
        const compose = new DockerComposeClient({
          projectDirectory: workspaceRoot,
          composeFile: composeTarget.composeFile,
          projectName,
          runner,
        });
        return new DockerRuntimeController({
          compose,
          delay: new SystemDelay(),
          observer: new ComposeProofObserver(() => workloads),
          startDelayGate: new ApiDatabaseAttemptGate(compose),
          runTimeoutMs: 45_000,
        });
      },
    });
    workloads = await platform.discover(target);

    await expect(platform.run(target, { id: "baseline", perturbations: [] })).resolves.toMatchObject({ status: "healthy" });
    await expect(platform.replay(target, {
      id: "delay-postgres",
      perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 2_500 }],
    })).resolves.toMatchObject({ status: "workload_failure" });

    expect(new Set(projects).size).toBeGreaterThanOrEqual(2);
    for (const project of projects) {
      const output = execFileSync("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`], { encoding: "utf8" });
      expect(output.trim()).toBe("");
    }
  }, 120_000);
});
