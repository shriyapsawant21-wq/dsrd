import type {
  ExecutionPlatform,
  DependencyEdge,
  RunResult,
  Schedule,
  TargetConfig,
  Workload,
} from "@dsrd/contracts";
import { randomUUID } from "node:crypto";

import type { CommandInvocation, CommandRunner } from "./command-runner.js";
import { DockerCommandError } from "./docker-compose-client.js";

export type ComposeServiceDefinition = {
  id: string;
  dependsOn?: string[];
  dependencyEdges?: DependencyEdge[];
  kind?: Workload["kind"];
};

export interface ComposeServiceDiscovery {
  discoverServices(target: Extract<TargetConfig, { platform: "compose" }>): Promise<ComposeServiceDefinition[]>;
}

export type DockerComposeServiceDiscoveryOptions = {
  projectDirectory: string;
  runner: CommandRunner;
};

export class DockerComposeServiceDiscovery implements ComposeServiceDiscovery {
  constructor(private readonly options: DockerComposeServiceDiscoveryOptions) {}

  async discoverServices(
    target: Extract<TargetConfig, { platform: "compose" }>
  ): Promise<ComposeServiceDefinition[]> {
    const invocation: CommandInvocation = {
      command: "docker",
      args: ["compose", "-f", target.composeFile, "config", "--format", "json"],
      cwd: this.options.projectDirectory
    };
    const result = await this.options.runner.run(invocation);
    if (result.exitCode !== 0) {
      throw new DockerCommandError(invocation, result);
    }

    const config: unknown = JSON.parse(result.stdout);
    if (!this.hasServices(config)) {
      throw new Error("Compose config does not contain a services object");
    }
    const externalVolumes = this.externalVolumes(config);
    if (externalVolumes.length > 0) {
      throw new Error(`Compose configuration declares external volumes: ${externalVolumes.join(", ")}`);
    }
    return Object.entries(config.services).map(([id, service]) => {
      const dependencyEdges = this.dependencyEdges(service);
      const dependsOn = dependencyEdges?.map(({ workloadId }) => workloadId);
      const kind = this.workloadKind(service);
      return {
        id,
        ...(dependsOn === undefined ? {} : { dependsOn }),
        ...(dependencyEdges === undefined ? {} : { dependencyEdges }),
        ...(kind === undefined ? {} : { kind }),
      };
    });
  }

  private hasServices(config: unknown): config is { services: Record<string, unknown> } {
    return typeof config === "object" && config !== null && "services" in config &&
      typeof config.services === "object" && config.services !== null && !Array.isArray(config.services);
  }

  private externalVolumes(config: unknown): string[] {
    if (typeof config !== "object" || config === null || !("volumes" in config) ||
      typeof config.volumes !== "object" || config.volumes === null || Array.isArray(config.volumes)) {
      return [];
    }
    return Object.entries(config.volumes)
      .filter(([, volume]) => typeof volume === "object" && volume !== null && "external" in volume && volume.external === true)
      .map(([name]) => name)
      .sort();
  }

  private dependencyEdges(service: unknown): DependencyEdge[] | undefined {
    if (typeof service !== "object" || service === null || !("depends_on" in service)) {
      return undefined;
    }
    const dependsOn = service.depends_on;
    if (Array.isArray(dependsOn)) {
      const edges = dependsOn
        .filter((dependency): dependency is string => typeof dependency === "string")
        .map((workloadId) => ({
          workloadId,
          condition: "service_started" as const,
          provenance: "declared" as const,
        }));
      return edges.length === 0 ? undefined : edges;
    }
    if (typeof dependsOn === "object" && dependsOn !== null) {
      const edges = Object.entries(dependsOn).map(([workloadId, config]) => ({
        workloadId,
        condition: this.dependencyCondition(config),
        provenance: "declared" as const,
      }));
      return edges.length === 0 ? undefined : edges;
    }
    return undefined;
  }

  private dependencyCondition(dependency: unknown): DependencyEdge["condition"] {
    if (typeof dependency !== "object" || dependency === null || !("condition" in dependency)) {
      return "service_started";
    }
    const condition = dependency.condition;
    return condition === "service_healthy" || condition === "service_completed_successfully"
      ? condition
      : "service_started";
  }

  private workloadKind(service: unknown): Workload["kind"] | undefined {
    if (typeof service !== "object" || service === null || !("labels" in service)) {
      return undefined;
    }
    const labels = service.labels;
    if (typeof labels !== "object" || labels === null || Array.isArray(labels)) {
      return undefined;
    }
    const kind = (labels as Record<string, unknown>)["dsrd.workload-kind"];
    return kind === "service" || kind === "process" || kind === "job" || kind === "initializer"
      ? kind
      : undefined;
  }
}

export interface ComposeScheduleExecutor {
  resetStack(): Promise<void>;
  runSchedule(schedule: Schedule, serviceOrder: string[]): Promise<RunResult>;
  replaySchedule(schedule: Schedule, serviceOrder: string[]): Promise<RunResult>;
}

export type ComposeExecutionPlatformOptions = {
  discovery: ComposeServiceDiscovery;
  executorFor(
    target: Extract<TargetConfig, { platform: "compose" }>,
    attemptId?: string,
  ): ComposeScheduleExecutor;
  supportsReadinessDelay?: boolean;
};

export class ComposeExecutionPlatform implements ExecutionPlatform {
  constructor(private readonly options: ComposeExecutionPlatformOptions) {}

  async discover(target: TargetConfig): Promise<Workload[]> {
    const composeTarget = this.composeTarget(target);
    const services = await this.options.discovery.discoverServices(composeTarget);
    return services.map((service) => ({
      id: service.id,
      kind: service.kind ?? "service",
      ...(service.dependsOn === undefined ? {} : { dependsOn: service.dependsOn }),
      ...(service.dependencyEdges === undefined ? {} : { dependencyEdges: service.dependencyEdges }),
      perturbablePhases: this.options.supportsReadinessDelay === true ? ["start", "ready"] : ["start"]
    }));
  }

  async reset(target: TargetConfig): Promise<void> {
    await this.options.executorFor(this.composeTarget(target)).resetStack();
  }

  async run(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    const composeTarget = this.composeTarget(target);
    const services = await this.discover(composeTarget);
    this.validateSchedule(schedule, services);
    return this.options.executorFor(composeTarget, this.createAttemptId())
      .runSchedule(schedule, services.map(({ id }) => id));
  }

  async replay(target: TargetConfig, schedule: Schedule): Promise<RunResult> {
    const composeTarget = this.composeTarget(target);
    const services = await this.discover(composeTarget);
    this.validateSchedule(schedule, services);
    return this.options.executorFor(composeTarget, this.createAttemptId())
      .replaySchedule(schedule, services.map(({ id }) => id));
  }

  private composeTarget(target: TargetConfig): Extract<TargetConfig, { platform: "compose" }> {
    if (target.platform !== "compose") {
      throw new Error(`ComposeExecutionPlatform cannot execute ${target.platform} targets`);
    }
    return target;
  }

  private validateSchedule(schedule: Schedule, services: Workload[]): void {
    const workloads = new Map(services.map((workload) => [workload.id, workload]));
    const seen = new Set<string>();
    for (const perturbation of schedule.perturbations) {
      const workload = workloads.get(perturbation.workloadId);
      if (workload === undefined) {
        throw new Error(`Unknown Compose service: ${perturbation.workloadId}`);
      }
      if (!workload.perturbablePhases.includes(perturbation.phase)) {
        throw new Error(`Unsupported Compose phase ${perturbation.phase} for ${perturbation.workloadId}`);
      }
      const key = `${perturbation.workloadId}:${perturbation.phase}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate perturbation for ${perturbation.workloadId} ${perturbation.phase}`);
      }
      seen.add(key);
    }
  }

  private createAttemptId(): string {
    return `attempt-${randomUUID().replaceAll("-", "")}`;
  }
}
