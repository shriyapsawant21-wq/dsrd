import type {
  ExecutionPlatform,
  FailureArtifact,
  FailureArtifactV2,
  Perturbation,
  RunResult,
  Schedule,
  TargetConfig,
  Workload,
} from "./index.js";

type Assert<T extends true> = T;

type GenericScheduleHasPerturbations = Schedule extends {
  id: string;
  perturbations: Perturbation[];
}
  ? true
  : false;

type GenericArtifactHasTarget = FailureArtifactV2 extends {
  version: 2;
  target: TargetConfig;
}
  ? true
  : false;

type PlatformDiscoversWorkloads = ExecutionPlatform extends {
  discover(target: TargetConfig): Promise<Workload[]>;
}
  ? true
  : false;

type RunUsesPhysicalOutcomes = RunResult["status"] extends
  | "healthy"
  | "workload_failure"
  | "execution_error"
  | "inconclusive"
  | "cancelled"
  ? true
  : false;

type _GenericScheduleHasPerturbations = Assert<GenericScheduleHasPerturbations>;
type _GenericArtifactHasTarget = Assert<GenericArtifactHasTarget>;
type _PlatformDiscoversWorkloads = Assert<PlatformDiscoversWorkloads>;
type _RunUsesPhysicalOutcomes = Assert<RunUsesPhysicalOutcomes>;

type LegacyArtifactsRemainSupported = Extract<FailureArtifact, { version: 2 }> extends FailureArtifactV2 ? true : false;
type _LegacyArtifactsRemainSupported = Assert<LegacyArtifactsRemainSupported>;
