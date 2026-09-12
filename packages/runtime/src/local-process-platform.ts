import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
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

export type LocalProcessReadiness = {
  workload: string;
  kind: "http" | "tcp" | "process" | "custom";
  status: "ready" | "timeout" | "unhealthy";
  observedAtMs: number;
  detail?: string;
};

export type LocalProcessObservation = {
  scheduleId: string;
  startedAtMs: number;
  workloads: Workload[];
  states: LocalProcessState[];
  readiness: LocalProcessReadiness[];
  workloadEvents: LocalProcessEvent[];
  logs: string[];
};

export interface LocalProcessRunObserver {
  evaluate(snapshot: LocalProcessObservation): Promise<RunResult>;
}

export type LocalProcessExecutionPlatformOptions = {
  observer: LocalProcessRunObserver;
  runTimeoutMs?: number;
  readinessTimeoutMs?: number;
  readinessPollIntervalMs?: number;
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
    try {
      await this.reset(target);
      return await this.execute(manifest, schedule);
    } catch (error) {
      return {
        scheduleId: schedule.id,
        status: "execution_error",
        events: [],
        logs: [],
        diagnostics: [{
          code: "local_process_execution_error",
          message: error instanceof Error ? error.message : "Local-process execution failed",
        }],
      };
    } finally {
      await this.stopChildren();
    }
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
    const readiness = await this.observeReadiness(manifest.workloads, states);
    const result = await this.options.observer.evaluate({
      scheduleId: schedule.id,
      startedAtMs,
      workloads: manifest.workloads.map(toWorkload),
      states: manifest.workloads.map((workload) => states.get(workload.id) ?? ({ workload: workload.id, state: "missing", observedAtMs: Date.now() })),
      readiness,
      workloadEvents: events,
      logs,
    });
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
      // A detached POSIX child becomes the leader of an attempt-owned process
      // group, so cleanup can terminate descendants as well as the launcher.
      detached: process.platform !== "win32",
    });
    this.activeChildren.add(child);
    child.stdout?.on("data", (data: Buffer) => logs.push(`${workload.id}: ${data.toString().trimEnd()}`));
    child.stderr?.on("data", (data: Buffer) => logs.push(`${workload.id}: ${data.toString().trimEnd()}`));
    child.once("close", () => this.activeChildren.delete(child));
    return child;
  }

  private async observeReadiness(
    workloads: LocalProcessWorkload[],
    states: ReadonlyMap<string, LocalProcessState>,
  ): Promise<LocalProcessReadiness[]> {
    const observations = await Promise.all(workloads.map(async (workload): Promise<LocalProcessReadiness[]> => {
      const assertion = workload.readiness;
      if (assertion === undefined) return [];
      if (assertion.type === "process") {
        return [{
          workload: workload.id,
          kind: "process",
          status: states.get(workload.id)?.state === "running" ? "ready" : "unhealthy",
          observedAtMs: Date.now(),
        }];
      }
      if (assertion.type === "http") {
        if (assertion.target === undefined || !isHttpUrl(assertion.target)) {
          return [{ workload: workload.id, kind: "http", status: "unhealthy", observedAtMs: Date.now(), detail: "HTTP readiness target must be an http(s) URL" }];
        }
        return [await probeHttpReadiness(
          workload.id,
          assertion.target,
          this.options.readinessTimeoutMs ?? 5_000,
          this.options.readinessPollIntervalMs ?? 100,
        )];
      }
      if (assertion.type !== "tcp" || assertion.target === undefined) return [];
      const target = parseTcpTarget(assertion.target);
      if (target === undefined) {
        return [{ workload: workload.id, kind: "tcp", status: "unhealthy", observedAtMs: Date.now(), detail: "TCP readiness target must be host:port" }];
      }
      return [await probeTcpReadiness(
        workload.id,
        target.host,
        target.port,
        this.options.readinessTimeoutMs ?? 5_000,
        this.options.readinessPollIntervalMs ?? 100,
      )];
    }));
    return observations.flat();
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
    for (const child of children) this.signalAttemptTree(child, "SIGTERM");
    await wait(100);
    for (const child of children) {
      if (this.isAttemptTreeAlive(child)) this.signalAttemptTree(child, "SIGKILL");
    }
    await Promise.all(children.map(waitForExit));
  }

  private signalAttemptTree(child: ChildProcess, signal: NodeJS.Signals): void {
    try {
      if (process.platform !== "win32" && child.pid !== undefined) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error;
    }
  }

  private isAttemptTreeAlive(child: ChildProcess): boolean {
    if (child.pid === undefined) return false;
    try {
      process.kill(process.platform !== "win32" ? -child.pid : child.pid, 0);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
      throw error;
    }
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

function parseTcpTarget(input: string): { host: string; port: number } | undefined {
  const separator = input.lastIndexOf(":");
  if (separator < 1) return undefined;
  const host = input.slice(0, separator);
  const port = Number(input.slice(separator + 1));
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? { host, port } : undefined;
}

function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function probeHttpReadiness(
  workload: string,
  url: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<LocalProcessReadiness> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await respondsSuccessfully(url, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())))) {
      return { workload, kind: "http", status: "ready", observedAtMs: Date.now() };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) await wait(Math.min(pollIntervalMs, remainingMs));
  } while (Date.now() < deadline);
  return { workload, kind: "http", status: "timeout", observedAtMs: Date.now() };
}

async function respondsSuccessfully(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeTcpReadiness(
  workload: string,
  host: string,
  port: number,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<LocalProcessReadiness> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await canConnect(host, port, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())))) {
      return { workload, kind: "tcp", status: "ready", observedAtMs: Date.now() };
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) await wait(Math.min(pollIntervalMs, remainingMs));
  } while (Date.now() < deadline);
  return { workload, kind: "tcp", status: "timeout", observedAtMs: Date.now() };
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function waitForExit(child: ChildProcess): Promise<number> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode ?? 1);
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
