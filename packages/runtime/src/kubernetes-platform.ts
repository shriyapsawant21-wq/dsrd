import type {
  ExecutionPlatform,
  RunResult,
  Schedule,
  TargetConfig,
  Workload,
} from "@dsrd/contracts";

import type { CommandRunner } from "./command-runner.js";

export type KubernetesResourceDefinition = {
  name: string;
  kind: "Deployment" | "StatefulSet" | "Job";
  dependsOn?: string[];
};

export interface KubernetesResourceDiscovery {
  discoverResources(target: Extract<TargetConfig, { platform: "kubernetes" }>): Promise<KubernetesResourceDefinition[]>;
}

export type KubectlKubernetesResourceDiscoveryOptions = {
  runner: CommandRunner;
  cwd?: string;
};

export class KubectlKubernetesResourceDiscovery implements KubernetesResourceDiscovery {
  constructor(private readonly options: KubectlKubernetesResourceDiscoveryOptions) {}

  async discoverResources(target: Extract<TargetConfig, { platform: "kubernetes" }>): Promise<KubernetesResourceDefinition[]> {
    const result = await this.options.runner.run({
      command: "kubectl",
      args: ["create", "--dry-run=client", "-f", target.manifestPath, "-o", "json", ...this.namespaceArgs(target)],
      cwd: this.options.cwd ?? process.cwd(),
    });
    if (result.exitCode !== 0) throw new Error(`kubectl create failed: ${result.stderr || `exit code ${result.exitCode}`}`);
    const documents = result.stdout.trim().split(/\n(?=\{)/).filter(Boolean).map((document) => JSON.parse(document) as unknown);
    const items = documents.flatMap((parsed) => isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : [parsed]);
    return items.flatMap((item): KubernetesResourceDefinition[] => {
      if (!isRecord(item) || !isRecord(item.metadata) || typeof item.metadata.name !== "string") return [];
      if (item.kind !== "Deployment" && item.kind !== "StatefulSet" && item.kind !== "Job") return [];
      return [{ name: item.metadata.name, kind: item.kind }];
    });
  }

  private namespaceArgs(target: Extract<TargetConfig, { platform: "kubernetes" }>): string[] {
    return target.namespace === undefined ? [] : ["--namespace", target.namespace];
  }
}

export interface KubernetesScheduleExecutor {
  resetNamespace(): Promise<void>;
  runSchedule(schedule: Schedule, workloadOrder: string[]): Promise<RunResult>;
  replaySchedule(schedule: Schedule, workloadOrder: string[]): Promise<RunResult>;
}

export type KubectlKubernetesExecutorOptions = {
  target: Extract<TargetConfig, { platform: "kubernetes" }>;
  runner: CommandRunner;
  evaluate?: (scheduleId: string) => Promise<RunResult>;
  observer?: KubernetesRunObserver;
  settleMs?: number;
  cwd?: string;
};

export type KubernetesRunSnapshot = {
  scheduleId: string;
  startedAtMs: number;
  states: Array<{ workload: string; state: "running" | "exited" | "missing"; exitCode?: number; observedAtMs: number }>;
  logs: string[];
  events: Array<{ workload: string; timeMs: number; event: string; detail?: string }>;
};

export interface KubernetesRunObserver {
  evaluate(snapshot: KubernetesRunSnapshot): Promise<RunResult>;
}

/**
 * A manifest-scoped Kubernetes lifecycle executor. It intentionally leaves
 * failure classification to `evaluate`, so kubectl errors are execution
 * errors rather than race discoveries.
 */
export class KubectlKubernetesExecutor implements KubernetesScheduleExecutor {
  constructor(private readonly options: KubectlKubernetesExecutorOptions) {}

  async resetNamespace(): Promise<void> {
    if (this.options.target.namespace !== undefined) {
      await this.runKubectl(["delete", "namespace", this.options.target.namespace, "--ignore-not-found", "--wait=true"]);
      return;
    }
    await this.runKubectl([
      "delete", "--ignore-not-found", "--wait=true", "-f", this.options.target.manifestPath,
      ...this.namespaceArgs(),
    ]);
  }

  async runSchedule(schedule: Schedule, _workloadOrder: string[]): Promise<RunResult> {
    const startedAtMs = Date.now();
    await this.resetNamespace();
    await this.applySelector("dsrd.infrastructure=namespace");
    const startDelays = new Map(schedule.perturbations
      .filter((perturbation) => perturbation.phase === "start")
      .map((perturbation) => [perturbation.workloadId, perturbation.delayMs]));
    await Promise.all(_workloadOrder.map(async (workloadId) => {
      const delayMs = startDelays.get(workloadId) ?? 0;
      if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      await this.applySelector(`dsrd.workload=${workloadId}`);
    }));
    if (this.options.observer !== undefined) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.options.settleMs ?? 1_500));
      return this.options.observer.evaluate(await this.observe(schedule.id, _workloadOrder, startedAtMs));
    }
    if (this.options.evaluate !== undefined) return this.options.evaluate(schedule.id);
    throw new Error("Kubernetes executor requires an observer or evaluator");
  }

  async replaySchedule(schedule: Schedule, workloadOrder: string[]): Promise<RunResult> {
    return this.runSchedule(schedule, workloadOrder);
  }

  private async runKubectl(args: string[]): Promise<void> {
    const result = await this.options.runner.run({
      command: "kubectl",
      args,
      cwd: this.options.cwd ?? process.cwd(),
    });
    if (result.exitCode !== 0) {
      throw new Error(`kubectl ${args[0]} failed: ${result.stderr || `exit code ${result.exitCode}`}`);
    }
  }

  private async applySelector(selector: string): Promise<void> {
    await this.runKubectl([
      "apply", "-f", this.options.target.manifestPath, "-l", selector, ...this.namespaceArgs(),
    ]);
  }

  private async observe(scheduleId: string, workloadOrder: string[], startedAtMs: number): Promise<KubernetesRunSnapshot> {
    const pods = await this.runKubectlResult(["get", "pods", "-o", "json", ...this.namespaceArgs()]);
    const parsed = JSON.parse(pods.stdout) as KubernetesPodList;
    const byWorkload = new Map<string, { state: "running" | "exited" | "missing"; exitCode?: number }>();
    for (const pod of parsed.items ?? []) {
      const workload = pod.metadata?.labels?.["dsrd.workload"];
      if (workload === undefined) continue;
      const exitCode = pod.status?.containerStatuses?.find((status) => status.state?.terminated !== undefined)?.state?.terminated?.exitCode;
      byWorkload.set(workload, { state: exitCode !== undefined || pod.status?.phase === "Failed" || pod.status?.phase === "Succeeded" ? "exited" : "running", ...(exitCode === undefined ? {} : { exitCode }) });
    }
    const logs: string[] = [];
    for (const workload of workloadOrder) {
      const result = await this.runKubectlResult(["logs", "-l", `dsrd.workload=${workload}`, "--all-containers", ...this.namespaceArgs()]);
      if (result.stdout.trim()) logs.push(`${workload}: ${result.stdout.trimEnd()}`);
    }
    const now = Date.now();
    return { scheduleId, startedAtMs, states: workloadOrder.map((workload) => ({ workload, ...(byWorkload.get(workload) ?? { state: "missing" as const }), observedAtMs: now })), logs, events: [] };
  }

  private async runKubectlResult(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const result = await this.options.runner.run({ command: "kubectl", args, cwd: this.options.cwd ?? process.cwd() });
    if (result.exitCode !== 0) throw new Error(`kubectl ${args[0]} failed: ${result.stderr || `exit code ${result.exitCode}`}`);
    return result;
  }

  private namespaceArgs(): string[] {
    return this.options.target.namespace === undefined ? [] : ["--namespace", this.options.target.namespace];
  }
}

export type KubernetesExecutionPlatformOptions = {
  discovery: KubernetesResourceDiscovery;
  executorFor(target: Extract<TargetConfig, { platform: "kubernetes" }>): KubernetesScheduleExecutor;
};

export class KubernetesExecutionPlatform implements ExecutionPlatform {
  constructor(private readonly options: KubernetesExecutionPlatformOptions) {}

  async discover(target: TargetConfig): Promise<Workload[]> {
    const kubernetesTarget = this.kubernetesTarget(target);
    const resources = await this.options.discovery.discoverResources(kubernetesTarget);
    return resources.map((resource) => ({
      id: resource.name,
      kind: resource.kind === "Job" ? "job" : "service",
      ...(resource.dependsOn === undefined ? {} : { dependsOn: resource.dependsOn }),
      perturbablePhases: ["start"],
    }));
  }

  async reset(target: TargetConfig): Promise<void> {
    await this.options.executorFor(this.kubernetesTarget(target)).resetNamespace();
  }

  async run(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    const kubernetesTarget = this.kubernetesTarget(target);
    const workloads = await this.discover(kubernetesTarget);
    this.validateSchedule(schedule, workloads);
    return this.options.executorFor(kubernetesTarget).runSchedule(schedule, workloads.map(({ id }) => id));
  }

  async replay(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    const kubernetesTarget = this.kubernetesTarget(target);
    const workloads = await this.discover(kubernetesTarget);
    this.validateSchedule(schedule, workloads);
    return this.options.executorFor(kubernetesTarget).replaySchedule(schedule, workloads.map(({ id }) => id));
  }

  private kubernetesTarget(target: TargetConfig): Extract<TargetConfig, { platform: "kubernetes" }> {
    if (target.platform !== "kubernetes") {
      throw new Error(`KubernetesExecutionPlatform cannot execute ${target.platform} targets`);
    }
    return target;
  }

  private validateSchedule(schedule: Schedule, workloads: Workload[]): void {
    const knownWorkloads = new Map(workloads.map((workload) => [workload.id, workload]));
    const seen = new Set<string>();
    for (const perturbation of schedule.perturbations) {
      const workload = knownWorkloads.get(perturbation.workloadId);
      if (workload === undefined) {
        throw new Error(`Unknown Kubernetes workload: ${perturbation.workloadId}`);
      }
      if (!workload.perturbablePhases.includes(perturbation.phase)) {
        throw new Error(`Unsupported Kubernetes phase ${perturbation.phase} for ${perturbation.workloadId}`);
      }
      const key = `${perturbation.workloadId}:${perturbation.phase}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate perturbation for ${perturbation.workloadId} ${perturbation.phase}`);
      }
      seen.add(key);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type KubernetesPodList = {
  items?: Array<{
    metadata?: { labels?: Record<string, string> };
    status?: {
      phase?: string;
      containerStatuses?: Array<{ state?: { terminated?: { exitCode?: number } } }>;
    };
  }>;
};
