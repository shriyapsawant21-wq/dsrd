import type {
  ExecutionPlatform,
  RunResult,
  Schedule,
  TargetConfig,
  Workload,
} from "@dsrd/contracts";

export type KubernetesResourceDefinition = {
  name: string;
  kind: "Deployment" | "StatefulSet" | "Job";
  dependsOn?: string[];
};

export interface KubernetesResourceDiscovery {
  discoverResources(target: Extract<TargetConfig, { platform: "kubernetes" }>): Promise<KubernetesResourceDefinition[]>;
}

export interface KubernetesScheduleExecutor {
  resetNamespace(): Promise<void>;
  runSchedule(schedule: Schedule, workloadOrder: string[]): Promise<RunResult>;
  replaySchedule(schedule: Schedule, workloadOrder: string[]): Promise<RunResult>;
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
