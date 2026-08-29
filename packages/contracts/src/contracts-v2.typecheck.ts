import type {
  ExecutionPlatform,
  FailureArtifact,
  Perturbation,
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

type GenericArtifactHasTarget = FailureArtifact extends {
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

type _GenericScheduleHasPerturbations = Assert<GenericScheduleHasPerturbations>;
type _GenericArtifactHasTarget = Assert<GenericArtifactHasTarget>;
type _PlatformDiscoversWorkloads = Assert<PlatformDiscoversWorkloads>;
