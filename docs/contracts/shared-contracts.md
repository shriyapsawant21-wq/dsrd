# Shared Contracts

These interfaces are the boundary between workstreams. Implement them once in `packages/contracts/src/index.ts` and import them everywhere. This is contract version 2; no package may retain a local service-keyed schedule type.

```ts
export type Workload = {
  id: string;
  kind: "service" | "process" | "job" | "initializer";
  dependsOn?: string[];
  perturbablePhases: Array<"start" | "ready">;
  readiness?: { type: "http" | "tcp" | "process" | "custom"; target?: string };
};

export type Perturbation = {
  workloadId: string;
  phase: "start" | "ready";
  delayMs: number;
};

export type Schedule = { id: string; perturbations: Perturbation[] };

export type TargetConfig =
  | { platform: "compose"; composeFile: string }
  | { platform: "local-process"; manifestPath: string }
  | { platform: "kubernetes"; manifestPath: string; namespace?: string };
```

## Runtime Boundary

```ts
export interface ExecutionPlatform {
  discover(target: TargetConfig): Promise<Workload[]>;
  reset(target: TargetConfig): Promise<void>;
  run(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
  replay(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
}
```

Riya owns platform implementations. The scheduler consumes injected `run` and `replay` functions and must not depend on Docker, child processes, or Kubernetes clients.

## Evidence Boundary

`RunResult.status` remains owned by Shriya's deterministic oracle. Execution and reset errors are not race failures. Timeline events retain normalized workload identity in their `service` field for v2 compatibility.

## Replay Artifact

```ts
export type FailureArtifact = {
  version: 2;
  createdAt: string;
  target: TargetConfig;
  originalSchedule: Schedule;
  minimizedSchedule: Schedule;
  expectedFailureReason?: string;
  events: TimelineEvent[];
};
```

Artifacts contain no credentials, tokens, kubeconfig contents, or secret environment values. Replay selects the target platform and calls the same adapter/oracle path used during discovery.

## Migration Rule

All three owners review a public-contract change before merging it. Migrate scheduler, runtime, and proof consumers in their own fresh sessions after this contract commits. Do not restore local copies of `Schedule`, `RunResult`, `TimelineEvent`, or `FailureArtifact`.
