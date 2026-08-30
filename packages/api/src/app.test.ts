import { expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { RunStore } from "./run-store.js";
import { RunService } from "./run-service.js";
import type { FailureArtifact } from "@dsrd/contracts";

it("rejects a non-Compose upload", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })));
  expect((await request(app).post("/api/runs").attach("composeFile", Buffer.from("x"), "logs.txt")).status).toBe(400);
});

it("returns an uploaded run and reports that an unfinished artifact is unavailable", async () => {
  const store = new RunStore();
  const app = createApp(store, new RunService(store, async () => new Promise(() => undefined)));
  const created = await request(app).post("/api/runs").attach("composeFile", Buffer.from("services: {}"), "compose.yaml");
  expect(created.status).toBe(202);
  expect((await request(app).get(`/api/runs/${created.body.runId}`)).status).toBe(200);
  expect((await request(app).get(`/api/runs/${created.body.runId}/report`)).status).toBe(409);
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
