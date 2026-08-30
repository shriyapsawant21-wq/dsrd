import { initialProgress, type ProgressEvent } from "./contracts.js";
import type { FailureArtifact } from "@dsrd/contracts";

export type RunRecord = { id: string; progress: ProgressEvent; artifact?: FailureArtifact; error?: string };
export class RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly subscribers = new Map<string, Set<(event: ProgressEvent) => void>>();
  private nextId = 1;
  create(): RunRecord {
    const id = `run-${this.nextId++}`;
    const run = { id, progress: initialProgress(id) };
    this.runs.set(id, run);
    return run;
  }
  get(id: string): RunRecord | undefined { return this.runs.get(id); }
  setArtifact(id: string, artifact: FailureArtifact): void { this.require(id).artifact = artifact; }
  setError(id: string, error: string): void { this.require(id).error = error; }
  subscribe(id: string, listener: (event: ProgressEvent) => void): () => void {
    const listeners = this.subscribers.get(id) ?? new Set();
    listeners.add(listener); this.subscribers.set(id, listeners);
    return () => listeners.delete(listener);
  }
  publish(id: string, event: ProgressEvent): void {
    const run = this.runs.get(id); if (!run) throw new Error(`Unknown run: ${id}`);
    run.progress = event; this.subscribers.get(id)?.forEach((listener) => listener(event));
  }
  private require(id: string): RunRecord {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Unknown run: ${id}`);
    return run;
  }
}
