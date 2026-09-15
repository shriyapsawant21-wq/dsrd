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
  eventId?: string;
  sequence?: number;
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
  path?: string[];
};

export type RunResult = {
  scheduleId: string;
  status: PhysicalRunStatus;
  events: TimelineEvent[];
  logs: string[];
  failureReason?: string;
  diagnostics?: RunDiagnostic[];
  failureSignature?: import("./evidence.js").FailureSignature;
  cleanup?: import("./execution.js").CleanupReport;
  appliedPerturbations?: import("./execution.js").AppliedPerturbation[];
};

export interface ExecutionPlatform {
  discover(target: TargetConfig): Promise<Workload[]>;
  reset(target: TargetConfig): Promise<void>;
  run(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
  replay(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
}

export type { FailureArtifact, FailureArtifactV2, FailureArtifactV3, FailureSignature, OrderingConstraint, OrderingPredicate } from "./evidence.js";
export { failureArtifactSchema, failureArtifactV2Schema, failureArtifactV3Schema } from "./evidence.js";
export type { AppliedPerturbation, AttemptContext, AttemptHandle, CleanupReport, PreparedTarget, WorkloadCapability, WorkloadModel } from "./execution.js";
export { defaultExperimentPolicy, experimentPolicySchema, inspectionResultSchema, parseProjectConfig, projectConfigSchema, repositoryInputSchema, runDiagnosticSchema, targetCandidateSchema } from "./repository.js";
export type { ExperimentPolicy, InspectionResult, ProjectConfig, ReadinessAssertion, RepositoryInput, RepositorySnapshot, TargetCandidate, WorkloadConfig } from "./repository.js";
export { redactSecrets } from "./redaction.js";
