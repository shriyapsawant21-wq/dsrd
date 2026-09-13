import { expect, it } from "vitest";
import { once } from "node:events";
import request from "supertest";
import { createApp, isTerminalRunPhase } from "./app.js";
import { RunStore } from "./run-store.js";
import { RunService } from "./run-service.js";
import type { FailureArtifact } from "@dsrd/contracts";

it("rejects a non-Compose upload", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })));
  expect((await request(app).post("/api/runs").attach("composeFile", Buffer.from("x"), "logs.txt")).status).toBe(400);
});

it("closes repository event streams for every terminal outcome", () => {
  for (const phase of [
    "completed", "no_failure", "target_unhealthy", "needs_configuration",
    "unsupported_target", "execution_error", "inconclusive", "cancelled", "error",
  ] as const) {
    expect(isTerminalRunPhase(phase)).toBe(true);
  }
  expect(isTerminalRunPhase("exploring")).toBe(false);
});

it("redacts secrets from API errors", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })), {
    inspect: async () => { throw new Error("token=super-secret"); },
  });

  const response = await request(app).post("/api/repositories/inspect").send({ repository: { kind: "checkout", path: "/project" } });
  expect(response.status).toBe(400);
  expect(JSON.stringify(response.body)).not.toContain("super-secret");
  expect(JSON.stringify(response.body)).toContain("[REDACTED]");
});

it("inspects a repository input through the injected onboarding operation", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })), {
    inspect: async (repository) => ({ snapshotId: "snapshot-1", candidates: [], suggestions: [], truncated: false, diagnostics: [{ code: "checked", message: repository.kind }] }),
  });

  const response = await request(app).post("/api/repositories/inspect").send({ repository: { kind: "checkout", path: "/project" } });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ status: "inspected", inspection: { diagnostics: [{ message: "checkout" }] } });
});

it("replays a validated artifact through the injected shared replay operation", async () => {
  const store = new RunStore();
  const artifact: FailureArtifact = { version: 2, createdAt: new Date(0).toISOString(), target: { platform: "compose", composeFile: "compose.yaml" }, originalSchedule: { id: "original", perturbations: [] }, minimizedSchedule: { id: "minimal", perturbations: [] }, events: [] };
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })), {
    replay: async (received) => ({ status: "reproduced", result: { scheduleId: received.minimizedSchedule.id, status: "workload_failure", events: [], logs: [] } }),
  });

  const response = await request(app).post("/api/replay").send({ artifact });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ status: "reproduced", result: { scheduleId: "minimal" } });
});

it("starts repository search asynchronously and preserves its terminal outcome", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })), {
    search: async () => ({ status: "needs_configuration", testedSchedules: 0, exploredCandidateSchedules: 0, diagnostics: [] }),
  });

  const created = await request(app).post("/api/repositories/search").send({ repository: { kind: "checkout", path: "/project" } });

  expect(created.status).toBe(202);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.get(created.body.runId)?.progress).toMatchObject({ phase: "needs_configuration", percentage: 100 });
  expect((await request(app).get(`/api/runs/${created.body.runId}`)).body).toMatchObject({
    diagnostics: [],
  });
});

it("persists a repository-search artifact and completes its event stream", async () => {
  const store = new RunStore();
  let finish!: (value: { status: string; testedSchedules: number; artifact: FailureArtifact }) => void;
  const artifact: FailureArtifact = {
    version: 2, createdAt: new Date(0).toISOString(),
    target: { platform: "compose", composeFile: "compose.yaml" },
    originalSchedule: { id: "original", perturbations: [] }, minimizedSchedule: { id: "minimal", perturbations: [] }, events: [],
  };
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })), {
    search: async () => new Promise((resolve) => { finish = resolve; }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  try {
    const created = await request(app).post("/api/repositories/search").send({ repository: { kind: "checkout", path: "/project" } });
    const port = (server.address() as { port: number }).port;
    const events = await fetch(`http://127.0.0.1:${port}/api/runs/${created.body.runId}/events`);
    finish({ status: "found_failure", testedSchedules: 7, artifact });

    expect(await events.text()).toContain("event: completed");
    expect((await request(app).get(`/api/runs/${created.body.runId}/report`)).body).toMatchObject({ version: 2, minimizedSchedule: { id: "minimal" } });
    expect(store.get(created.body.runId)?.progress).toMatchObject({ phase: "completed", testedSchedules: 7 });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

it("returns an uploaded run and reports that an unfinished artifact is unavailable", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => new Promise(() => undefined)));
  const created = await request(app)
    .post("/api/runs")
    .field("relativePaths", JSON.stringify(["demo/compose.yaml"]))
    .attach("projectFiles", Buffer.from("services: {}"), "compose.yaml");
  expect(created.status).toBe(202);
  expect((await request(app).get(`/api/runs/${created.body.runId}`)).status).toBe(200);
  expect((await request(app).get(`/api/runs/${created.body.runId}/report`)).status).toBe(409);
});

it("starts the existing run service from a materialized project folder", async () => {
  const store = new RunStore();
  let receivedTarget: { platform: string; composeFile?: string } | undefined;
  const app = createApp(store, new RunService(store, async (target) => {
    receivedTarget = target;
    return { status: "no_failure" };
  }));

  const created = await request(app)
    .post("/api/runs")
    .field("relativePaths", JSON.stringify(["demo/compose.yaml", "demo/Dockerfile"]))
    .attach("projectFiles", Buffer.from("services: { api: { build: . } }"), "compose.yaml")
    .attach("projectFiles", Buffer.from("FROM node:20-alpine"), "Dockerfile");

  expect(created.status).toBe(202);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(receivedTarget).toMatchObject({ platform: "compose", composeFile: expect.stringMatching(/demo[\\/]compose\.yaml$/) });
});

it("rejects a folder upload before creating a run when no Compose file exists", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })));

  const response = await request(app)
    .post("/api/runs")
    .field("relativePaths", JSON.stringify(["demo/Dockerfile"]))
    .attach("projectFiles", Buffer.from("FROM node:20-alpine"), "Dockerfile");

  expect(response.status).toBe(400);
  expect(response.body.error).toBe("No supported project target found");
  expect(store.get("run-1")).toBeUndefined();
});

it("returns 404 for an unknown run", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })));
  expect((await request(app).get("/api/runs/missing")).status).toBe(404);
});

it("returns failure rows derived from the stored artifact", async () => {
  const store = new RunStore();
  const run = store.create();
  const schedule = { id: "schedule-1", perturbations: [] };
  const artifact: FailureArtifact = {
    version: 2,
    createdAt: new Date(0).toISOString(),
    target: { platform: "compose", composeFile: "compose.yaml" },
    originalSchedule: schedule,
    minimizedSchedule: schedule,
    expectedFailureReason: "postgres was not ready",
    events: [{ timeMs: 12, service: "api", event: "db_connection_failed" }]
  };
  store.setArtifact(run.id, artifact);
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })));

  const response = await request(app).get(`/api/runs/${run.id}`);
  expect(response.body.failures).toEqual([{ id: "failure-1", name: "DB_CONNECTION_FAILED", severity: "critical", reason: "postgres was not ready" }]);
});
