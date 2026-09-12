import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
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

  it("classifies a timed-out process attempt and cleans it up", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-timeout-"));
    const pidFile = join(directory, "process.pid");
    const manifest = join(directory, "manifest.json");
    const script = "require('node:fs').writeFileSync(process.env.DSRD_CHILD_PID_FILE, String(process.pid)); setInterval(() => {}, 1000);";
    await writeFile(manifest, JSON.stringify({
      workloads: [{ id: "hang", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", script], environment: { DSRD_CHILD_PID_FILE: pidFile } }],
    }));
    try {
      const platform = new LocalProcessExecutionPlatform({ observer, runTimeoutMs: 100 });
      await expect(platform.run({ platform: "local-process", manifestPath: manifest }, { id: "timeout", perturbations: [] })).resolves.toMatchObject({
        status: "execution_error",
        diagnostics: [{ code: "local_process_execution_error" }],
      });
      const pid = Number(await readFile(pidFile, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports declared process readiness to the proof observer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-readiness-"));
    const manifest = join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify({
      workloads: [
        { id: "server", kind: "process", perturbablePhases: [], readiness: { type: "process" }, command: [process.execPath, "-e", "setInterval(() => {}, 1000)"] },
        { id: "gate", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 100)"] },
      ],
    }));
    const observations: LocalProcessObservation[] = [];
    try {
      const platform = new LocalProcessExecutionPlatform({
        observer: { evaluate: async (snapshot) => {
          observations.push(snapshot);
          return { scheduleId: snapshot.scheduleId, status: "healthy", events: [], logs: [] };
        },
        },
      });
      await platform.run({ platform: "local-process", manifestPath: manifest }, { id: "process-ready", perturbations: [] });

      expect(observations[0]?.readiness).toContainEqual(expect.objectContaining({
        workload: "server",
        kind: "process",
        status: "ready",
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports a bounded TCP readiness timeout to the proof observer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-tcp-readiness-"));
    const manifest = join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify({
      workloads: [
        { id: "server", kind: "process", perturbablePhases: [], readiness: { type: "tcp", target: "127.0.0.1:1" }, command: [process.execPath, "-e", "setInterval(() => {}, 1000)"] },
        { id: "gate", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 100)"] },
      ],
    }));
    const observations: LocalProcessObservation[] = [];
    try {
      const platform = new LocalProcessExecutionPlatform({
        readinessTimeoutMs: 50,
        readinessPollIntervalMs: 5,
        observer: { evaluate: async (snapshot) => {
          observations.push(snapshot);
          return { scheduleId: snapshot.scheduleId, status: "healthy", events: [], logs: [] };
        } },
      });
      await platform.run({ platform: "local-process", manifestPath: manifest }, { id: "tcp-timeout", perturbations: [] });

      expect(observations[0]?.readiness).toContainEqual(expect.objectContaining({
        workload: "server",
        kind: "tcp",
        status: "timeout",
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports HTTP readiness once the declared endpoint responds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-http-readiness-"));
    const manifest = join(directory, "manifest.json");
    const port = await availablePort();
    await writeFile(manifest, JSON.stringify({
      workloads: [
        { id: "server", kind: "process", perturbablePhases: [], readiness: { type: "http", target: `http://127.0.0.1:${port}/ready` }, command: [process.execPath, "-e", `require('node:http').createServer((_request, response) => response.end('ready')).listen(${port})`] },
        { id: "gate", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 100)"] },
      ],
    }));
    const observations: LocalProcessObservation[] = [];
    try {
      const platform = new LocalProcessExecutionPlatform({
        readinessTimeoutMs: 500,
        readinessPollIntervalMs: 5,
        observer: { evaluate: async (snapshot) => {
          observations.push(snapshot);
          return { scheduleId: snapshot.scheduleId, status: "healthy", events: [], logs: [] };
        } },
      });
      await platform.run({ platform: "local-process", manifestPath: manifest }, { id: "http-ready", perturbations: [] });

      expect(observations[0]?.readiness).toContainEqual(expect.objectContaining({
        workload: "server",
        kind: "http",
        status: "ready",
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports malformed readiness targets without attempting an unbounded probe", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-malformed-readiness-"));
    const manifest = join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify({
      workloads: [
        { id: "http", kind: "process", perturbablePhases: [], readiness: { type: "http", target: "not-a-url" }, command: [process.execPath, "-e", "setInterval(() => {}, 1000)"] },
        { id: "tcp", kind: "process", perturbablePhases: [], readiness: { type: "tcp", target: "not-a-host-port" }, command: [process.execPath, "-e", "setInterval(() => {}, 1000)"] },
        { id: "gate", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 20)"] },
      ],
    }));
    const observations: LocalProcessObservation[] = [];
    try {
      const platform = new LocalProcessExecutionPlatform({
        observer: { evaluate: async (snapshot) => {
          observations.push(snapshot);
          return { scheduleId: snapshot.scheduleId, status: "healthy", events: [], logs: [] };
        } },
      });

      await platform.run({ platform: "local-process", manifestPath: manifest }, { id: "malformed-readiness", perturbations: [] });

      expect(observations[0]?.readiness).toEqual(expect.arrayContaining([
        expect.objectContaining({ workload: "http", kind: "http", status: "unhealthy" }),
        expect.objectContaining({ workload: "tcp", kind: "tcp", status: "unhealthy" }),
      ]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not accept a reachable HTTP endpoint that returns an unexpected status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-http-status-"));
    const manifest = join(directory, "manifest.json");
    const port = await availablePort();
    await writeFile(manifest, JSON.stringify({
      workloads: [
        { id: "server", kind: "process", perturbablePhases: [], readiness: { type: "http", target: `http://127.0.0.1:${port}/ready` }, command: [process.execPath, "-e", `require('node:http').createServer((_request, response) => { response.statusCode = 503; response.end('unavailable'); }).listen(${port})`] },
        { id: "gate", kind: "job", perturbablePhases: [], command: [process.execPath, "-e", "setTimeout(() => process.exit(0), 20)"] },
      ],
    }));
    const observations: LocalProcessObservation[] = [];
    try {
      const platform = new LocalProcessExecutionPlatform({
        readinessTimeoutMs: 50,
        readinessPollIntervalMs: 5,
        observer: { evaluate: async (snapshot) => {
          observations.push(snapshot);
          return { scheduleId: snapshot.scheduleId, status: "healthy", events: [], logs: [] };
        } },
      });

      await platform.run({ platform: "local-process", manifestPath: manifest }, { id: "http-status", perturbations: [] });

      expect(observations[0]?.readiness).toContainEqual(expect.objectContaining({
        workload: "server", kind: "http", status: "timeout",
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports an explicit reset configuration error for a stateful manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-local-reset-required-"));
    const manifest = join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify({
      resetRequired: true,
      workloads: [{ id: "server", kind: "process", perturbablePhases: [], command: [process.execPath, "-e", "setInterval(() => {}, 1000)"] }],
    }));
    try {
      const platform = new LocalProcessExecutionPlatform({ observer });

      await expect(platform.run({ platform: "local-process", manifestPath: manifest }, { id: "missing-reset", perturbations: [] })).resolves.toMatchObject({
        status: "execution_error",
        diagnostics: [{ code: "local_process_reset_required" }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        server.close(() => reject(new Error("Unable to allocate a local test port")));
        return;
      }
      server.close((error) => error === undefined ? resolve(address.port) : reject(error));
    });
  });
}
