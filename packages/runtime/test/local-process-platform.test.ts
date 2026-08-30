import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RunResult } from "@dsrd/contracts";
import { WorkloadProofObserver } from "@dsrd/proof";

import {
  LocalProcessExecutionPlatform,
  type LocalProcessObservation,
} from "../src/index.js";

const manifestPath = fileURLToPath(
  new URL("../../../fixtures/local-startup-race/manifest.json", import.meta.url),
);

const target = { platform: "local-process" as const, manifestPath };

const observer = {
  async evaluate(snapshot: LocalProcessObservation): Promise<RunResult> {
    const failed = snapshot.states.find(
      ({ state, exitCode }) => state === "exited" && exitCode !== 0,
    );
    return {
      scheduleId: snapshot.scheduleId,
      status: failed === undefined ? "pass" : "fail",
      events: snapshot.workloadEvents.map(({ workload, ...event }) => ({
        ...event,
        service: workload,
      })),
      logs: snapshot.logs,
      ...(failed === undefined ? {} : { failureReason: `${failed.workload} exited with code ${failed.exitCode}` }),
    };
  },
};

describe("LocalProcessExecutionPlatform", () => {
  it("discovers manifest workloads and delegates normal, failing, and replay runs to proof", async () => {
    const platform = new LocalProcessExecutionPlatform({ observer });

    await expect(platform.discover(target)).resolves.toContainEqual({
      id: "bootstrap",
      kind: "initializer",
      perturbablePhases: ["ready"],
    });
    await expect(platform.run(target, { id: "baseline", perturbations: [] })).resolves.toMatchObject({
      scheduleId: "baseline",
      status: "pass",
    });
    const failing = {
      id: "delayed-bootstrap",
      perturbations: [{ workloadId: "bootstrap", phase: "ready" as const, delayMs: 100 }],
    };
    await expect(platform.run(target, failing)).resolves.toMatchObject({
      scheduleId: "delayed-bootstrap",
      status: "fail",
    });
    await expect(platform.replay(target, failing)).resolves.toMatchObject({
      scheduleId: "delayed-bootstrap",
      status: "fail",
    });
  });

  it("uses the deterministic proof observer for the local fixture", async () => {
    const platform = new LocalProcessExecutionPlatform({ observer: new WorkloadProofObserver() });

    await expect(platform.run(target, { id: "proof-baseline", perturbations: [] })).resolves.toMatchObject({
      status: "pass",
    });
    await expect(platform.run(target, {
      id: "proof-failure",
      perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 100 }],
    })).resolves.toMatchObject({
      status: "fail",
      failureReason: expect.stringContaining("exited with code 1"),
    });
  });
});
