import type { Express, NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { BackendError } from "./errors.js";
import { isTerminalStatus } from "./job-events.js";
import { JobManager } from "./job-manager.js";
import type { ApiError, ApiErrorCode, JobEvent } from "./types.js";
import {
  parseFailureArtifact,
  parseSearchRequest
} from "./validation.js";

export function registerRoutes(app: Express, jobs: JobManager): void {
  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/search", (request, response) => {
    const job = jobs.startSearch(parseSearchRequest(request.body));
    response.status(202).json({ jobId: job.id });
  });

  app.post("/api/replay", (request, response) => {
    const job = jobs.startReplay(parseFailureArtifact(request.body));
    response.status(202).json({ jobId: job.id });
  });

  app.get("/api/jobs/:jobId", (request, response) => {
    const job = jobs.getJob(request.params.jobId);
    if (job === undefined) {
      throw new BackendError(
        "JOB_NOT_FOUND",
        "Unknown job: " + request.params.jobId
      );
    }
    response.json(job);
  });

  app.post("/api/jobs/:jobId/cancel", (request, response) => {
    const job = jobs.cancel(request.params.jobId);
    response.status(job.status === "cancel_requested" ? 202 : 200).json(job);
  });

  app.get("/api/jobs/:jobId/artifact", (request, response) => {
    const artifact = jobs.artifactFor(request.params.jobId);
    response
      .status(200)
      .type("application/json")
      .set("Content-Disposition", 'attachment; filename="failure.json"')
      .send(JSON.stringify(artifact, null, 2) + "\n");
  });

  app.get("/api/jobs/:jobId/events", (request, response) => {
    const jobId = request.params.jobId;
    const initial = jobs.getJob(jobId);
    if (initial === undefined) {
      throw new BackendError("JOB_NOT_FOUND", "Unknown job: " + jobId);
    }

    response.status(200);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    response.flushHeaders();
    writeSse(response, "snapshot", initial);

    let unsubscribe: () => void = () => undefined;
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    response.once("close", cleanup);

    const listener = (event: JobEvent) => {
      writeSse(response, event.type, event);
      if (
        event.type === "job_completed" ||
        event.type === "job_failed" ||
        event.type === "job_cancelled"
      ) {
        response.end();
      }
    };
    unsubscribe = jobs.subscribe(jobId, listener, true);
    const current = jobs.getJob(jobId);
    if (current !== undefined && isTerminalStatus(current.status) && !response.writableEnded) {
      response.end();
    }
  });
}

export function apiErrorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError || isBodyParserError(error)) {
    sendApiError(response, 400, "VALIDATION_ERROR", "Request body is invalid");
    return;
  }
  if (error instanceof BackendError) {
    sendApiError(response, statusFor(error.code), error.code, error.message);
    return;
  }
  sendApiError(response, 500, "EXECUTION_ERROR", "Debugger execution failed");
}

function writeSse(response: Response, event: string, data: unknown): void {
  response.write("event: " + event + "\n");
  response.write("data: " + JSON.stringify(data) + "\n\n");
}

function sendApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string
): void {
  const body: ApiError = { error: { code, message } };
  response.status(status).json(body);
}

function statusFor(code: ApiErrorCode): number {
  if (code === "JOB_NOT_FOUND") return 404;
  if (
    code === "JOB_ACTIVE" ||
    code === "JOB_TERMINAL" ||
    code === "ARTIFACT_NOT_READY"
  ) {
    return 409;
  }
  if (code === "VALIDATION_ERROR" || code === "UNSUPPORTED_PLATFORM") return 400;
  return 500;
}

function isBodyParserError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "type" in error &&
    (error.type === "entity.parse.failed" || error.type === "entity.too.large");
}
