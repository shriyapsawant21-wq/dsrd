# Service-Agnostic Startup Race Debugger Design

## Goal

Evolve the debugger from a Docker Compose-specific scheduler into a platform-independent race debugger. It must explore startup and readiness ordering among application workloads without requiring adapters for databases, frameworks, or other dependency products.

## Scope

The MVP supports adapters for Docker Compose and local processes. Kubernetes is a planned third adapter after the generic pipeline is proven. The search, minimization, artifact, replay, and timeline layers are shared across all adapters.

## Non-Goals

- Database-specific adapters for PostgreSQL, SQLite, Redis, or any other product.
- Kubernetes delivery before the Compose and local-process end-to-end pipeline is stable.
- Treating adapter execution errors as race failures.

## Vocabulary

A **workload** is any independently observable lifecycle or initialization boundary. It can represent a container service, local process, one-shot job, migration, or embedded-resource initializer. A database is a workload only when it has an independently controlled lifecycle; an embedded SQLite database is represented through the workload that creates or initializes its schema.

## Architecture

```text
Target configuration
  -> ExecutionPlatform adapter discovers WorkloadModel
  -> Generic schedule generator selects workload/phase perturbations
  -> Adapter resets and executes the schedule
  -> Adapter normalizes observations and delegates status to the oracle
  -> RunResult
  -> Generic search and minimizer
  -> FailureArtifact
  -> Adapter replay using the same target and oracle path
  -> Timeline/UI
```

The scheduler depends only on an injected run function. It neither starts containers/processes nor classifies a failure.

## Generic Model

```ts
type Workload = {
  id: string;
  kind: "service" | "process" | "job" | "initializer";
  dependsOn?: string[];
  perturbablePhases: Array<"start" | "ready">;
  readiness?: {
    type: "http" | "tcp" | "process" | "custom";
    target?: string;
  };
};

type Perturbation = {
  workloadId: string;
  phase: "start" | "ready";
  delayMs: number;
};

type Schedule = {
  id: string;
  perturbations: Perturbation[];
};

type TargetConfig =
  | { platform: "compose"; composeFile: string }
  | { platform: "local-process"; manifestPath: string }
  | { platform: "kubernetes"; manifestPath: string; namespace?: string };

interface ExecutionPlatform {
  discover(target: TargetConfig): Promise<Workload[]>;
  reset(target: TargetConfig): Promise<void>;
  run(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
  replay(target: TargetConfig, schedule: Schedule): Promise<RunResult>;
}
```

An adapter publishes only supported workload phases. Candidate generation must not create unsupported perturbations. Adapters map generic perturbations to their native controls:

| Adapter | Native mapping |
|---|---|
| Compose | service start or readiness exposure |
| Local process | manifest-defined command spawn or readiness gate |
| Kubernetes (planned) | workload creation, Job completion, or readiness exposure |

## Evidence and Replay

`RunResult.status` remains the oracle's decision. The scheduler trusts it and does not inspect Docker logs, process exit codes, or Kubernetes state to infer failure.

Artifacts require a coordinated v2 contract migration to include `target: TargetConfig`, a generic perturbation-based schedule, and the existing expected failure evidence. Artifacts must not contain credentials, kubeconfig contents, tokens, or secret environment values. Timeline events continue to use normalized workload ID, relative time, event name, and optional detail. Platform-native diagnostics remain adapter-owned.

Replay loads the artifact, selects the named adapter, invokes `adapter.replay(target, minimizedSchedule)`, and asks the same oracle path whether the expected failure reproduced. Adapter reset/unavailability failures are execution errors, not race discoveries.

## Ownership

| Area | Owner |
|---|---|
| generic schedule exploration, minimization, artifact and CLI orchestration | Akil |
| ExecutionPlatform, Compose/local-process/Kubernetes adapters, reset and replay execution | Riya |
| workload probes, normalized observations, failure oracle and timeline evidence | Shriya |
| public contract migration | all three owners |

## Checkpoint Timeline

The repository will maintain `docs/checkpoints.md` as the single status source. It records owner, deliverable, dependency, evidence command, status, commit/PR, remaining work, and blockers for each checkpoint.

| Checkpoint | Owner | Deliverable | Dependencies |
|---|---|---|---|
| C0 | Shared | generic contract v2 approved and merged | all owners |
| C1 | Akil | generic scheduler against fake adapter | C0 |
| C2 | Riya | Compose ExecutionPlatform adapter | C0 |
| C3 | Shriya | platform-neutral oracle and timeline evidence | C0 |
| C4 | Team | Compose discovery: normal pass -> real failure | C1-C3 |
| C5 | Team | minimized artifact and deterministic replay | C4 |
| C6 | Team | local-process adapter and fixture | C0, stable C4/C5 |
| C7 | Future | Kubernetes adapter and fixture | stable C4/C5 |

Every completed checkpoint updates `docs/checkpoints.md` immediately using this template:

```text
Checkpoint: C# — name
Status: not started | in progress | blocked | complete
Owner: name
Evidence: command and result
Commit/PR: reference
Remaining work: exact tasks
Dependencies: ready | waiting on <owner/output>
Blockers: none | description
Next checkpoint: C#
```

## Checkpoint Prompts

Create `docs/prompts/checkpoints/C0.md` through `C7.md`. Each prompt must state the checkpoint goal and non-goals, owner, supplied inputs, exact requested work, acceptance criteria, verification command, the update template, and dependencies. The prompt may not expand ownership or change a public contract without the three-owner review.

## Verification Strategy

- Akil uses fake adapters for deterministic candidate, search, minimizer, artifact, and replay tests.
- Riya tests each adapter's discovery, reset, supported perturbations, execution, and replay behavior.
- Shriya tests the oracle from normalized observations and verifies timeline ordering.
- Each platform fixture must prove normal pass -> discovered failure -> minimized schedule -> replayed expected failure.

## Migration Rule

The existing `Schedule` and `FailureArtifact` types are public contracts. Do not partially convert individual packages. First update `docs/contracts/shared-contracts.md` and `packages/contracts`, obtain all three owner checks, merge the contract migration, then adapt consumers.
