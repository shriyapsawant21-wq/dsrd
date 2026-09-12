export type DependencyEdge = {
  workloadId: string;
  condition: "service_started" | "service_healthy" | "service_completed_successfully";
  provenance: "declared" | "configured";
};

export type Workload = {
  id: string;
  kind: "service" | "process" | "job" | "initializer";
  dependsOn?: string[];
  dependencyEdges?: DependencyEdge[];
  perturbablePhases: Array<"start" | "ready">;
  readiness?: {
    type: "http" | "tcp" | "process" | "custom";
    target?: string;
  };
};

export type Perturbation = {
  workloadId: string;
  phase: "start" | "ready";
  delayMs: number;
};

export type Schedule = {
  id: string;
  perturbations: Perturbation[];
};

export type TargetConfig =
  | { platform: "compose"; composeFile: string }
  | { platform: "local-process"; manifestPath: string }
  | { platform: "kubernetes"; manifestPath: string; namespace?: string };

export type TimelineEvent = {
  timeMs: number;
  service: string;
  event: string;
  detail?: string;
};

export type PhysicalRunStatus =
  | "healthy"
  | "workload_failure"
  | "execution_error"
  | "inconclusive"
  | "cancelled";

export type RunDiagnostic = {
  code: string;
  message: string;
};

export type RunResult = {
  scheduleId: string;
  status: PhysicalRunStatus;
  events: TimelineEvent[];
  logs: string[];
  failureReason?: string;
  diagnostics?: RunDiagnostic[];
};

export interface ExecutionPlatform {
  discover(target: TargetConfig): Promise<Workload[]>;
  reset(target: TargetConfig): Promise<void>;
  run(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
  replay(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
}

export type FailureArtifact = {
  version: 2;
  createdAt: string;
  target: TargetConfig;
  originalSchedule: Schedule;
  minimizedSchedule: Schedule;
  expectedFailureReason?: string;
  events: TimelineEvent[];
};
