import express from "express";
import multer from "multer";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunService } from "./run-service.js";
import { RunStore } from "./run-store.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2_000_000 } });
export function createApp(store: RunStore, service: RunService) {
  const app = express();
  app.post("/api/runs", upload.single("composeFile"), async (req, res) => {
    const file = req.file;
    if (!file || !/\.ya?ml$/i.test(file.originalname)) return res.status(400).json({ error: "A Compose YAML file is required" });
    const directory = await mkdtemp(join(tmpdir(), "dsrd-web-run-"));
    const composePath = join(directory, /\.yml$/i.test(file.originalname) ? "compose.yml" : "compose.yaml");
    await writeFile(composePath, file.buffer);
    const run = store.create();
    void service.start(run.id, composePath);
    return res.status(202).json({ runId: run.id, status: "queued" });
  });
  app.get("/api/runs/:runId", (req, res) => {
    const run = store.get(req.params.runId);
    return run ? res.json(run) : res.status(404).json({ error: "Run not found" });
  });
  app.get("/api/runs/:runId/events", (req, res) => {
    const run = store.get(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const write = (event: typeof run.progress) => {
      const terminal = ["completed", "no_failure", "error"].includes(event.phase);
      res.write(`event: ${terminal ? event.phase : "progress"}\ndata: ${JSON.stringify(event)}\n\n`);
      if (terminal) res.end();
    };
    write(run.progress);
    const unsubscribe = store.subscribe(run.id, write);
    req.on("close", unsubscribe);
  });
  app.get("/api/runs/:runId/report", (req, res) => {
    const run = store.get(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (!run.artifact) return res.status(409).json({ error: "Report is not ready" });
    res.setHeader("Content-Disposition", `attachment; filename=dsrd-${run.id}-report.json`);
    return res.json(run.artifact);
  });
  app.get("/api/runs/:runId/failures/:failureId", (req, res) => {
    const run = store.get(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (!run.artifact || req.params.failureId !== "failure-1") return res.status(404).json({ error: "Failure not found" });
    return res.json({ id: "failure-1", reason: run.artifact.expectedFailureReason ?? "Startup race discovered", severity: "critical", originalSchedule: run.artifact.originalSchedule, minimizedSchedule: run.artifact.minimizedSchedule, events: run.artifact.events });
  });
  return app;
}
