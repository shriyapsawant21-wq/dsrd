import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionPlatform, RunResult, Schedule, TargetConfig, Workload } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { createOnboardingService, runSharedDiscovery } from "./onboarding.js";

describe("onboarding service", () => {
  it("uses the same shared discovery entry point for a configured direct target", async () => {
    const result = await runSharedDiscovery({
      platform: successfulPlatform(),
      target: { platform: "local-process", manifestPath: "manifest.json" },
      delayOptionsMs: [0, 1],
      baselineRuns: 1,
      confirmationRuns: 1,
    });

    expect(result).toMatchObject({ status: "found_failure" });
  });

  it("returns needs_configuration without executing a selected checkout lacking dsrd.yaml", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsrd-onboarding-test-"));
    await writeFile(join(root, "manifest.json"), JSON.stringify({ workloads: [] }));
    const platform = platformThatMustNotRun();

    const result = await createOnboardingService({ platform }).search({
      repository: { kind: "checkout", path: root },
    });

    expect(result).toMatchObject({
      status: "needs_configuration",
      diagnostics: [{ code: "configuration_required" }],
    });
  });

  it("publishes a v3 artifact with checkout provenance after verified replay", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsrd-onboarding-test-"));
    await writeFile(join(root, "manifest.json"), JSON.stringify({ workloads: [] }));
    await writeFile(join(root, "dsrd.yaml"), [
      "version: 1",
      "target:",
      "  id: local-process:manifest.json",
      "  adapter: local-process",
      "  root: .",
      "workloads:",
      "  api:",
      "    kind: process",
      "    command: [node, app.js]",
      "    readiness: { id: api-ready, type: http, url: http://127.0.0.1:3000/health, observer: host, expectedStatus: 200 }",
      "state: { policy: fresh-owned }",
      "experiment: { baselineRuns: 1, confirmationRuns: 1, replayRuns: 1, maxExecutions: 30, maxInFlight: 1, delayOptionsMs: [0, 1], timeouts: { acquisitionMs: 1000, preflightMs: 1000, runMs: 1000, readinessMs: 1000, cleanupMs: 1000 } }",
    ].join("\n"));
    const platform = successfulPlatform();

    const result = await createOnboardingService({ platform }).search({
      repository: { kind: "checkout", path: root },
    });

    expect(result).toMatchObject({
      status: "found_failure",
      artifact: { version: 3, repository: { contentDigest: expect.any(String) }, verification: { baselineRuns: 1, confirmationRuns: 1, replayRuns: 1 } },
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });
});

function platformThatMustNotRun(): ExecutionPlatform {
  const fail = async (): Promise<never> => { throw new Error("platform must not execute"); };
  return {
    discover: fail as unknown as (target: TargetConfig) => Promise<Workload[]>,
    reset: fail as unknown as (target: TargetConfig) => Promise<void>,
    run: fail as unknown as (target: TargetConfig, schedule: Schedule) => Promise<RunResult>,
    replay: fail as unknown as (target: TargetConfig, schedule: Schedule) => Promise<RunResult>,
  };
}

function successfulPlatform(): ExecutionPlatform {
  const run = async (_target: TargetConfig, schedule: Schedule): Promise<RunResult> => {
    if (schedule.perturbations.length === 0) return { scheduleId: schedule.id, status: "healthy", events: [], logs: [] };
    return {
      scheduleId: schedule.id,
      status: "workload_failure",
      failureReason: "api failed",
      failureSignature: { workloadId: "api", assertionId: "api-ready", category: "readiness_failed" },
      events: [{ timeMs: 1, service: "api", event: "readiness_failed" }],
      logs: [],
    };
  };
  return {
    discover: async () => [{ id: "api", kind: "process", perturbablePhases: ["start"] }],
    reset: async () => undefined,
    run,
    replay: run,
  };
}
