import express from "express";
import multer from "multer";
import { RunService } from "./run-service.js";
import { RunStore } from "./run-store.js";
import { materializeProject } from "./project-upload.js";
import type { RunPhase } from "./contracts.js";
import { failureArtifactSchema, repositoryInputSchema, type FailureArtifact, type InspectionResult, type RepositoryInput, type RunResult } from "@dsrd/contracts";

export type ApiOnboardingOperations = {
  inspect?: (repository: RepositoryInput) => Promise<InspectionResult>;
  replay?: (artifact: FailureArtifact) => Promise<{ status: "reproduced" | "not_reproduced"; result: RunResult }>;
  search?: (request: { repository: RepositoryInput; targetId?: string; configPath?: string }) => Promise<{ status: string; testedSchedules?: number; artifact?: FailureArtifact }>;
};

export function isTerminalRunPhase(phase: RunPhase): boolean {
  return [
    "completed", "no_failure", "target_unhealthy", "needs_configuration",
    "unsupported_target", "execution_error", "inconclusive", "cancelled", "error",
  ].includes(phase);
}

function summarizeFailures(artifact?: FailureArtifact) {
  if (!artifact) return [];
  const event = [...artifact.events].reverse().find(({ event }) => /fail|error|refused|exit|fatal/i.test(event)) ?? artifact.events.at(-1);
  return [{ id: "failure-1", name: (event?.event ?? "startup_race").toUpperCase(), severity: "critical", reason: artifact.expectedFailureReason ?? "Startup race discovered" }];
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2_000_000, files: 200 } });
export function createApp(store: RunStore, service: RunService, onboarding: ApiOnboardingOperations = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.post("/api/repositories/inspect", async (req, res) => {
    if (onboarding.inspect === undefined) return res.status(501).json({ error: "Repository inspection is not configured" });
    try {
      const inspection = await onboarding.inspect(repositoryInputSchema.parse(req.body?.repository));
      return res.status(200).json({ status: "inspected", inspection });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid repository input" });
    }
  });
  app.post("/api/replay", async (req, res) => {
    if (onboarding.replay === undefined) return res.status(501).json({ error: "Replay is not configured" });
    try {
      const result = await onboarding.replay(failureArtifactSchema.parse(req.body?.artifact));
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid replay artifact" });
    }
  });
  app.post("/api/repositories/search", async (req, res) => {
    if (onboarding.search === undefined) return res.status(501).json({ error: "Repository search is not configured" });
    try {
      const repository = repositoryInputSchema.parse(req.body?.repository);
      const run = store.create();
      void (async () => {
        store.publish(run.id, { ...run.progress, phase: "exploring", percentage: 10, message: "Inspecting repository" });
        try {
          const result = await onboarding.search!({ repository, targetId: req.body?.targetId, configPath: req.body?.configPath });
          if (result.status === "found_failure" && result.artifact !== undefined) store.setArtifact(run.id, result.artifact);
          const phase = result.status === "found_failure" ? "completed" : result.status as RunPhase;
          store.publish(run.id, { ...store.get(run.id)!.progress, phase, percentage: 100, message: phase.replaceAll("_", " "), testedSchedules: result.testedSchedules ?? 0, failureCount: phase === "completed" ? 1 : 0 });
        } catch (error) {
          store.setError(run.id, error instanceof Error ? error.message : "Repository search failed");
          store.publish(run.id, { ...store.get(run.id)!.progress, phase: "error", percentage: 100, message: "Repository search failed", failureCount: 0 });
        }
      })();
      return res.status(202).json({ runId: run.id, status: "queued" });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid repository search" });
    }
  });
  app.post("/api/runs", upload.array("projectFiles", 200), async (req, res) => {
    try {
      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: "Select a project folder containing one Compose file" });
      }
      const { target } = await materializeProject(req.files, req.body.relativePaths, req.body.platform);
      const run = store.create();
      void service.start(run.id, target);
      return res.status(202).json({ runId: run.id, status: "queued" });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid project upload" });
    }
  });
  app.get("/api/runs/:runId", (req, res) => {
    const run = store.get(req.params.runId);
    return run ? res.json({ ...run, failures: summarizeFailures(run.artifact) }) : res.status(404).json({ error: "Run not found" });
  });
  app.get("/api/runs/:runId/events", (req, res) => {
    const run = store.get(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const write = (event: typeof run.progress) => {
      const terminal = isTerminalRunPhase(event.phase);
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
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: "Invalid project upload" });
    return next(error);
  });
  return app;
}
