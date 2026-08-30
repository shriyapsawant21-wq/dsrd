import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  ExecutionPlatform,
  RunResult,
  Schedule,
  TargetConfig,
  Workload
} from "@dsrd/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { createBackendApp } from "../src/app.js";
import { DebuggerService } from "../src/debugger-service.js";
import { JobManager } from "../src/job-manager.js";

const target = {
  platform: "compose" as const,
  composeFile: "compose.yaml"
};
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    })
  ));
});

describe("local web backend routes", () => {
  it("reports health and rejects malformed search requests", async () => {
    const { baseUrl } = await startBackend(new ApiPlatform());

    const health = await fetch(baseUrl + "/api/health");
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok" });

    const invalid = await postJson(baseUrl + "/api/search", {
      target,
      delayOptionsMs: []
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" }
    });
  });

  it("rejects a concurrent job and cancels before another schedule", async () => {
    const platform = new ApiPlatform(true);
    const { baseUrl } = await startBackend(platform);
    const started = await postJson(baseUrl + "/api/search", {
      target,
      delayOptionsMs: [0, 1_000]
    });
    const { jobId } = await started.json() as { jobId: string };
    await platform.firstRunStarted;

    const concurrent = await postJson(baseUrl + "/api/search", {
      target,
      delayOptionsMs: [0]
    });
    expect(concurrent.status).toBe(409);
    await expect(concurrent.json()).resolves.toMatchObject({
      error: { code: "JOB_ACTIVE" }
    });

    const cancel = await postJson(baseUrl + "/api/jobs/" + jobId + "/cancel", {});
    expect(cancel.status).toBe(202);
    platform.releaseFirstRun();
    await waitForJob(baseUrl, jobId, "cancelled");
    expect(platform.runIds).toEqual(["schedule-000"]);
  });

  it("streams ordered history and downloads artifacts only as attachments", async () => {
    const { baseUrl } = await startBackend(new ApiPlatform());
    const started = await postJson(baseUrl + "/api/search", {
      target,
      delayOptionsMs: [0, 1_000]
    });
    const { jobId } = await started.json() as { jobId: string };
    const view = await waitForJob(baseUrl, jobId, "completed");
    expect(view).not.toHaveProperty("artifact");

    const stream = await fetch(baseUrl + "/api/jobs/" + jobId + "/events");
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const streamText = await stream.text();
    expect(streamText).toContain("event: snapshot");
    expect(streamText.indexOf("event: job_started")).toBeLessThan(
      streamText.indexOf("event: job_completed")
    );

    const artifact = await fetch(baseUrl + "/api/jobs/" + jobId + "/artifact");
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get("content-disposition")).toBe(
      'attachment; filename="failure.json"'
    );
    await expect(artifact.json()).resolves.toMatchObject({
      version: 2,
      target
    });
  });

  it("validates uploaded artifacts and replays them through the platform", async () => {
    const platform = new ApiPlatform();
    const { baseUrl } = await startBackend(platform);

    const invalid = await postJson(baseUrl + "/api/replay", { version: 1 });
    expect(invalid.status).toBe(400);

    const replay = await postJson(baseUrl + "/api/replay", {
      version: 2,
      createdAt: "2026-08-30T00:00:00.000Z",
      target,
      originalSchedule: failingSchedule("original"),
      minimizedSchedule: failingSchedule("minimized"),
      expectedFailureReason: "proof: dependency unavailable",
      events: []
    });
    expect(replay.status).toBe(202);
    const { jobId } = await replay.json() as { jobId: string };
    const view = await waitForJob(baseUrl, jobId, "completed");
    expect(view).toMatchObject({
      replay: { status: "reproduced" }
    });
    expect(platform.replayIds).toEqual(["minimized"]);
  });
});

class ApiPlatform implements ExecutionPlatform {
  readonly runIds: string[] = [];
  readonly replayIds: string[] = [];
  readonly firstRunStarted: Promise<void>;
  private signalStarted!: () => void;
  private firstRunReleased: Promise<void>;
  private signalReleased!: () => void;

  constructor(private readonly holdFirstRun = false) {
    this.firstRunStarted = new Promise((resolve) => {
      this.signalStarted = resolve;
    });
    this.firstRunReleased = new Promise((resolve) => {
      this.signalReleased = resolve;
    });
  }

  async discover(): Promise<Workload[]> {
    return [{
      id: "postgres",
      kind: "service",
      perturbablePhases: ["ready"]
    }];
  }

  async reset(): Promise<void> {}

  async run(_target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    this.runIds.push(schedule.id);
    if (this.runIds.length === 1) {
      this.signalStarted();
      if (this.holdFirstRun) await this.firstRunReleased;
    }
    return proofResult(schedule);
  }

  async replay(_target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    this.replayIds.push(schedule.id);
    return proofResult(schedule);
  }

  releaseFirstRun(): void {
    this.signalReleased();
  }
}

async function startBackend(platform: ExecutionPlatform) {
  const jobs = new JobManager(new DebuggerService(() => platform));
  const server = createServer(createBackendApp({ jobs }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: "http://127.0.0.1:" + address.port };
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function waitForJob(
  baseUrl: string,
  jobId: string,
  status: string
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 2_000;
  while (true) {
    const response = await fetch(baseUrl + "/api/jobs/" + jobId);
    const view = await response.json() as Record<string, unknown>;
    if (view.status === status) return view;
    if (Date.now() > deadline) throw new Error("Timed out waiting for " + status);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function failingSchedule(id: string): Schedule {
  return {
    id,
    perturbations: [{
      workloadId: "postgres",
      phase: "ready",
      delayMs: 1_000
    }]
  };
}

function proofResult(schedule: Schedule): RunResult {
  const failed = schedule.perturbations.some(({ delayMs }) => delayMs >= 1_000);
  return {
    scheduleId: schedule.id,
    status: failed ? "fail" : "pass",
    events: [],
    logs: [],
    ...(failed ? { failureReason: "proof: dependency unavailable" } : {})
  };
}
