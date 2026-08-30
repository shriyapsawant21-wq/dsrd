import { expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { RunStore } from "./run-store.js";
import { RunService } from "./run-service.js";

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
