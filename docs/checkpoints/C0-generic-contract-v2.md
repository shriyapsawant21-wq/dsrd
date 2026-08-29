# C0 - Generic Contract v2

## Purpose

C0 replaces the Docker service-specific public model with a workload-based contract that every execution platform can share. It establishes the stable boundary required for the scheduler, runtime, proof layer, replay artifacts, and future platform adapters to evolve independently.

C0 defines types and interfaces only. It does not migrate scheduler, runtime, or proof implementations and does not add a Compose, local-process, or Kubernetes adapter.

## Public Model

| Contract | Responsibility |
| --- | --- |
| `Workload` | Describes an independently observable service, process, job, or initializer and the phases the platform can perturb. |
| `Perturbation` | Applies a delay to one supported phase of one workload. |
| `Schedule` | Groups an ordered set of workload perturbations under a repeatable ID. |
| `TargetConfig` | Selects a Compose, local-process, or future Kubernetes target without exposing platform details to the scheduler. |
| `ExecutionPlatform` | Defines discovery, reset, run, and replay behavior for platform adapters. |
| `FailureArtifact` v2 | Stores the target, original schedule, minimized schedule, expected evidence, and timeline needed for replay. |

`TimelineEvent` and `RunResult` retain their existing semantics. In particular, `RunResult.status` remains the deterministic oracle's decision; an adapter error is not automatically a discovered race.

## Data Flow

```text
TargetConfig
  -> ExecutionPlatform.discover()
  -> Workload[]
  -> scheduler creates Schedule
  -> ExecutionPlatform.run()
  -> oracle produces RunResult
  -> FailureArtifact v2
  -> ExecutionPlatform.replay()
```

The scheduler operates only on workloads and perturbations. Platform adapters translate those generic values into native controls, while the proof layer evaluates normalized observations.

## Ownership Boundary

- Akil consumes `Workload`, `Schedule`, and `FailureArtifact` in the scheduler, minimizer, artifact, replay, and CLI paths.
- Riya implements `ExecutionPlatform` adapters and translates generic perturbations into platform lifecycle controls.
- Shriya consumes normalized workload observations and remains responsible for deterministic failure classification and timeline evidence.

All packages import these contracts from `@dsrd/contracts`. Local copies or service-keyed alternatives would split the public model and are not allowed.

## Artifact Safety

`FailureArtifact` stores target identifiers and replay evidence, but it must never contain credentials, tokens, kubeconfig contents, or secret environment values. Platform-native diagnostics remain adapter-owned.

## Verification

C0 is verified with:

```powershell
npm run typecheck --workspace @dsrd/contracts
npm test -- packages/contracts/test/contracts.test.ts
```

The contract typecheck validates the v2 schedule, target-bearing artifact, and platform discovery boundary. Workspace-wide typechecking is intentionally deferred until C1-C3 migrate their v1 consumers.

## Handoff

Akil and Shriya reviewed the public shapes. C1, C2, and C3 can proceed in parallel from staged contract commit `f8be82c`:

- C1: migrate the scheduler to workload perturbations.
- C2: implement the Compose execution platform.
- C3: normalize proof evidence around workload identities.

C0 must not be merged into the integration branch until those consumer migrations restore the workspace typecheck.
