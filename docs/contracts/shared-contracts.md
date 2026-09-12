# Shared Contracts

These interfaces are the boundary between packages. Implement them once in `packages/contracts/src/index.ts` and import them everywhere. This is contract version 2; no package may retain a local service-keyed schedule type.

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

Platform implementations live in runtime. The scheduler consumes injected `run` and `replay` functions and must not depend on Docker, child processes, or Kubernetes clients.

## Evidence Boundary

`RunResult.status` is determined by the deterministic proof oracle. Execution and reset errors are not race failures. Timeline events retain normalized workload identity in their `service` field for v2 compatibility.

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

Review every scheduler, runtime, proof, API, and UI consumer of a public-contract change before merging it. Do not restore local copies of `Schedule`, `RunResult`, `TimelineEvent`, or `FailureArtifact`.

## Repository Onboarding Contracts

`@dsrd/contracts` is the sole owner of the Zod schemas for repository inputs,
inspection results, `dsrd.yaml` configuration, experiment policy, and portable
evidence. A repository input is either a checkout path or a pinned Git URL/ref;
Git URLs with embedded credentials are rejected. Configuration parsing is strict:
it rejects unknown dependency IDs, invalid relative paths, missing Compose launch
files, invalid deadlines/counts, and local long-running workloads without a
readiness assertion.

`FailureArtifact` is now a v2/v3 union. Version 2 keeps the exact legacy replay
shape and remains explicitly unverified. Version 3 adds source/config/model and
environment digests, public binding requirements, failure signature, ordering
constraints, and confirmation evidence. It is the only format eligible for the
verified replay guarantees introduced by onboarding.

`TimelineEvent` may carry a captured `eventId` and monotonic `sequence`; `RunResult`
may carry a stable failure signature, applied perturbations, and exact cleanup
report. These are optional extensions so existing v2 producers and consumers keep
working while new adapters provide stronger evidence.
