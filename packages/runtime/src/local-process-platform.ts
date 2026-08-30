import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import type { ExecutionPlatform, RunResult, Schedule, TargetConfig, Workload } from "@dsrd/contracts";

import { loadLocalProcessManifest, type LoadedLocalProcessManifest, type LocalProcessWorkload } from "./local-process-manifest.js";

export type LocalProcessState = {
  workload: string;
  state: "running" | "exited" | "missing";
  exitCode?: number;
  observedAtMs: number;
};

export type LocalProcessEvent = {
  workload: string;
  timeMs: number;
  event: string;
  detail?: string;
};

export type LocalProcessObservation = {
  scheduleId: string;
  startedAtMs: number;
  workloads: Workload[];
  states: LocalProcessState[];
  readiness: [];
  workloadEvents: LocalProcessEvent[];
  logs: string[];
};

export interface LocalProcessRunObserver {
  evaluate(snapshot: LocalProcessObservation): Promise<RunResult>;
}

export type LocalProcessExecutionPlatformOptions = {
  observer: LocalProcessRunObserver;
  runTimeoutMs?: number;
};

export class LocalProcessExecutionPlatform implements ExecutionPlatform {
  private readonly activeChildren = new Set<ChildProcess>();

  constructor(private readonly options: LocalProcessExecutionPlatformOptions) {}

  async discover(target: TargetConfig): Promise<Workload[]> {
    const manifest = await this.manifestFor(target);
    return manifest.workloads.map(({ command: _command, cwd: _cwd, environment: _environment, ...workload }) => workload);
  }

  async reset(target: TargetConfig): Promise<void> {
    const manifest = await this.manifestFor(target);
    await this.stopChildren();
    if (manifest.resetCommand !== undefined) await this.runResetCommand(manifest);
  }

  async run(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    const manifest = await this.manifestFor(target);
    this.validateSchedule(schedule, manifest.workloads);
    await this.reset(target);
    return this.execute(manifest, schedule);
  }

  async replay(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    return this.run(target, schedule);
  }

  private async execute(manifest: LoadedLocalProcessManifest, schedule: Schedule): Promise<RunResult> {
    const startedAtMs = Date.now();
    const events: LocalProcessEvent[] = [];
    const logs: string[] = [];
    const states = new Map<string, LocalProcessState>();
    const perturbations = new Map(schedule.perturbations.map((item) => [`${item.workloadId}:${item.phase}`, item.delayMs]));
    const completions: Promise<void>[] = [];
    await Promise.all(manifest.workloads.map(async (workload) => {
      const startDelayMs = perturbations.get(`${workload.id}:start`) ?? 0;
      if (startDelayMs > 0) await wait(startDelayMs);
      const readyDelayMs = perturbations.get(`${workload.id}:ready`) ?? 0;
      const child = this.startWorkload(manifest, workload, readyDelayMs, logs);
      states.set(workload.id, { workload: workload.id, state: "running", observedAtMs: Date.now() });
      events.push({ workload: workload.id, timeMs: Date.now() - startedAtMs, event: "process_started" });
      const complete = waitForExit(child).then((exitCode) => {
        states.set(workload.id, { workload: workload.id, state: "exited", exitCode, observedAtMs: Date.now() });
        events.push({ workload: workload.id, timeMs: Date.now() - startedAtMs, event: "process_exited", detail: `exit code ${exitCode}` });
      });
      if (workload.kind === "process" || workload.kind === "service") {
        void complete;
      } else {
        completions.push(complete);
      }
    }));
    const timeoutMs = this.options.runTimeoutMs ?? 5_000;
    await withTimeout(Promise.all(completions).then(() => undefined), timeoutMs, schedule.id);
    const result = await this.options.observer.evaluate({
      scheduleId: schedule.id,
      startedAtMs,
      workloads: manifest.workloads.map(toWorkload),
      states: manifest.workloads.map((workload) => states.get(workload.id) ?? ({ workload: workload.id, state: "missing", observedAtMs: Date.now() })),
      readiness: [],
      workloadEvents: events,
      logs,
    });
    await this.stopChildren();
    return result;
  }

  private startWorkload(
    manifest: LoadedLocalProcessManifest,
    workload: LocalProcessWorkload,
    readyDelayMs: number,
    logs: string[],
  ): ChildProcess {
    const [command, ...args] = workload.command;
    if (command === undefined) throw new Error(`Local-process workload ${workload.id} has no command`);
    const child = spawn(command, args, {
      cwd: workload.cwd === undefined ? manifest.directory : resolve(manifest.directory, workload.cwd),
      env: { ...process.env, ...workload.environment, DSRD_READY_DELAY_MS: String(readyDelayMs) },
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    this.activeChildren.add(child);
    child.stdout?.on("data", (data: Buffer) => logs.push(`${workload.id}: ${data.toString().trimEnd()}`));
    child.stderr?.on("data", (data: Buffer) => logs.push(`${workload.id}: ${data.toString().trimEnd()}`));
    child.once("close", () => this.activeChildren.delete(child));
    return child;
  }

  private async runResetCommand(manifest: LoadedLocalProcessManifest): Promise<void> {
    const [command, ...args] = manifest.resetCommand as string[];
    if (command === undefined) throw new Error("Local-process reset command is empty");
    const child = spawn(command, args, { cwd: manifest.directory, stdio: "ignore" });
    const exitCode = await waitForExit(child);
    if (exitCode !== 0) throw new Error(`Local-process reset command exited with code ${exitCode}`);
  }

  private async stopChildren(): Promise<void> {
    const children = [...this.activeChildren];
    for (const child of children) child.kill("SIGTERM");
    await Promise.all(children.map(waitForExit));
  }

  private async manifestFor(target: TargetConfig): Promise<LoadedLocalProcessManifest> {
    if (target.platform !== "local-process") throw new Error(`LocalProcessExecutionPlatform cannot execute ${target.platform} targets`);
    return loadLocalProcessManifest(target.manifestPath);
  }

  private validateSchedule(schedule: Schedule, workloads: LocalProcessWorkload[]): void {
    const byId = new Map(workloads.map((workload) => [workload.id, workload]));
    for (const perturbation of schedule.perturbations) {
      const workload = byId.get(perturbation.workloadId);
      if (workload === undefined) throw new Error(`Unknown local-process workload: ${perturbation.workloadId}`);
      if (!workload.perturbablePhases.includes(perturbation.phase)) throw new Error(`Unsupported local-process phase ${perturbation.phase} for ${perturbation.workloadId}`);
    }
  }
}

function toWorkload({ command: _command, cwd: _cwd, environment: _environment, ...workload }: LocalProcessWorkload): Workload {
  return workload;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function withTimeout(operation: Promise<void>, timeoutMs: number, scheduleId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Local process schedule ${scheduleId} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
