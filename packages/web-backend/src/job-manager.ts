import { randomUUID } from "node:crypto";

import type { FailureArtifact, TargetConfig } from "@dsrd/contracts";

import { DebuggerService } from "./debugger-service.js";
import { BackendError } from "./errors.js";
import { isTerminalStatus } from "./job-events.js";
import type {
  JobEvent,
  JobKind,
  JobView,
  ProgressListener,
  SearchRequest
} from "./types.js";

type JobManagerOptions = {
  now?: () => number;
  createId?: () => string;
};

type StoredJob = {
  view: JobView;
  artifact?: FailureArtifact;
  target: TargetConfig;
  startedAtMs: number;
  abort: AbortController;
  events: JobEvent[];
  listeners: Set<(event: JobEvent) => void>;
};

export class JobManager {
  private readonly jobs = new Map<string, StoredJob>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private activeJobId: string | undefined;

  constructor(
    private readonly debuggerService: DebuggerService,
    options: JobManagerOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
  }

  startSearch(request: SearchRequest): JobView {
    const job = this.createJob("search", request.target);
    this.launch(job, async (onProgress) => {
      const discovery = await this.debuggerService.search(
        request,
        onProgress,
        job.abort.signal
      );
      job.view.discovery = discovery;
      if (discovery.status === "found_failure") {
        job.artifact = discovery.artifact;
      }
    });
    return this.copyView(job.view);
  }

  startReplay(artifact: FailureArtifact): JobView {
    const job = this.createJob("replay", artifact.target);
    this.launch(job, async (onProgress) => {
      job.view.replay = await this.debuggerService.replay(
        artifact,
        onProgress,
        job.abort.signal
      );
    });
    return this.copyView(job.view);
  }

  getJob(jobId: string): JobView | undefined {
    const job = this.jobs.get(jobId);
    return job === undefined ? undefined : this.copyView(job.view);
  }

  eventsFor(jobId: string): JobEvent[] {
    return [...this.requireJob(jobId).events];
  }

  subscribe(
    jobId: string,
    listener: (event: JobEvent) => void,
    replayExisting = false
  ): () => void {
    const job = this.requireJob(jobId);
    job.listeners.add(listener);
    if (replayExisting) {
      for (const event of job.events) listener(event);
    }
    return () => job.listeners.delete(listener);
  }

  cancel(jobId: string): JobView {
    const job = this.requireJob(jobId);
    if (isTerminalStatus(job.view.status)) {
      throw new BackendError("JOB_TERMINAL", "Job " + jobId + " is already terminal");
    }
    if (job.view.status !== "cancel_requested") {
      job.view.status = "cancel_requested";
      job.abort.abort(new DOMException("Job cancelled", "AbortError"));
    }
    return this.copyView(job.view);
  }

  artifactFor(jobId: string): FailureArtifact {
    const artifact = this.requireJob(jobId).artifact;
    if (artifact === undefined) {
      throw new BackendError(
        "ARTIFACT_NOT_READY",
        "Job " + jobId + " does not have a failure artifact"
      );
    }
    return artifact;
  }

  private createJob(kind: JobKind, target: TargetConfig): StoredJob {
    if (this.activeJobId !== undefined) {
      throw new BackendError(
        "JOB_ACTIVE",
        "Debugger job already active: " + this.activeJobId
      );
    }
    const id = this.createId();
    const job: StoredJob = {
      view: { id, kind, status: "queued", attempts: 0 },
      target,
      startedAtMs: this.now(),
      abort: new AbortController(),
      events: [],
      listeners: new Set()
    };
    this.jobs.set(id, job);
    this.activeJobId = id;
    return job;
  }

  private launch(
    job: StoredJob,
    execute: (onProgress: ProgressListener) => Promise<void>
  ): void {
    queueMicrotask(() => {
      void this.runJob(job, execute);
    });
  }

  private async runJob(
    job: StoredJob,
    execute: (onProgress: ProgressListener) => Promise<void>
  ): Promise<void> {
    job.view.status = "running";
    job.view.startedAt = new Date(job.startedAtMs).toISOString();
    this.emit(job, {
      type: "job_started",
      jobId: job.view.id,
      kind: job.view.kind,
      timeMs: this.elapsed(job)
    });

    let failure: unknown;
    try {
      await execute((progress) => {
        job.view.attempts = progress.attempt;
        this.emit(job, progress.type === "schedule_started"
          ? {
              type: "schedule_started",
              jobId: job.view.id,
              attempt: progress.attempt,
              schedule: progress.schedule,
              timeMs: this.elapsed(job)
            }
          : {
              type: "schedule_completed",
              jobId: job.view.id,
              attempt: progress.attempt,
              scheduleId: progress.schedule.id,
              result: progress.result,
              timeMs: this.elapsed(job)
            });
      });
    } catch (error) {
      failure = error;
    }

    try {
      await this.debuggerService.platformFor(job.target).reset(job.target);
    } catch (cleanupError) {
      if (failure === undefined) failure = cleanupError;
    }

    job.view.finishedAt = new Date(this.now()).toISOString();
    if (job.abort.signal.aborted) {
      job.view.status = "cancelled";
      this.emit(job, {
        type: "job_cancelled",
        jobId: job.view.id,
        timeMs: this.elapsed(job)
      });
    } else if (failure !== undefined) {
      job.view.status = "failed";
      job.view.error = {
        code: "EXECUTION_ERROR",
        message: safeMessage(failure)
      };
      this.emit(job, {
        type: "job_failed",
        jobId: job.view.id,
        message: job.view.error.message,
        timeMs: this.elapsed(job)
      });
    } else {
      job.view.status = "completed";
      this.emit(job, {
        type: "job_completed",
        jobId: job.view.id,
        timeMs: this.elapsed(job)
      });
    }
    this.activeJobId = undefined;
  }

  private emit(job: StoredJob, event: JobEvent): void {
    job.events.push(event);
    for (const listener of job.listeners) listener(event);
  }

  private elapsed(job: StoredJob): number {
    return Math.max(0, this.now() - job.startedAtMs);
  }

  private requireJob(jobId: string): StoredJob {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new BackendError("JOB_NOT_FOUND", "Unknown job: " + jobId);
    }
    return job;
  }

  private copyView(view: JobView): JobView {
    return { ...view };
  }
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Debugger execution failed";
}
