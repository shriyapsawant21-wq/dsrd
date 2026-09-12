import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      status: failed === undefined ? "healthy" : "workload_failure",
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
      status: "healthy",
    });
    const failing = {
      id: "delayed-bootstrap",
      perturbations: [{ workloadId: "bootstrap", phase: "ready" as const, delayMs: 100 }],
    };
    await expect(platform.run(target, failing)).resolves.toMatchObject({
      scheduleId: "delayed-bootstrap",
      status: "workload_failure",
    });
    await expect(platform.replay(target, failing)).resolves.toMatchObject({
      scheduleId: "delayed-bootstrap",
      status: "workload_failure",
    });
  });

  it("uses the deterministic proof observer for the local fixture", async () => {
    const platform = new LocalProcessExecutionPlatform({ observer: new WorkloadProofObserver() });

    await expect(platform.run(target, { id: "proof-baseline", perturbations: [] })).resolves.toMatchObject({
      status: "healthy",
    });
    await expect(platform.run(target, {
      id: "proof-failure",
      perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 100 }],
    })).resolves.toMatchObject({
      status: "workload_failure",
      failureReason: expect.stringContaining("exited with code 1"),
    });
  });

  it("terminates a workload's child process before releasing the attempt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-cleanup-"));
    const pidFile = join(directory, "child.pid");
    const manifest = join(directory, "manifest.json");
    const script = "const { spawn } = require('node:child_process'); const fs = require('node:fs'); const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); fs.writeFileSync(process.env.DSRD_CHILD_PID_FILE, String(child.pid)); setInterval(() => {}, 1000);";
    await writeFile(manifest, JSON.stringify({
      workloads: [
        { id: "parent", kind: "process", perturbablePhases: [], command: [process.execPath, "-e", script], environment: { DSRD_CHILD_PID_FILE: pidFile } },
        { id: "gate", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 100)"] },
      ],
    }));
    try {
      const platform = new LocalProcessExecutionPlatform({ observer });
      await expect(platform.run({ platform: "local-process", manifestPath: manifest }, { id: "cleanup", perturbations: [] })).resolves.toMatchObject({ status: "healthy" });
      const childPid = Number(await readFile(pidFile, "utf8"));
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
