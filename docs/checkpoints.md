# Integration Checkpoints

This file is the live source of truth. Update the relevant section immediately after every verification checkpoint.

## Execution order

1. C0 is a joint contract checkpoint.
2. C1 (Akil), C2 (Riya), and C3 (Shriya) begin together after C0; they are parallel, not sequential.
3. C4 begins only after C1-C3 are implemented and integrated.
4. C5 follows C4; C6 follows stable C4/C5; C7 is future work after explicit admission.

Every completed owner must replace their checkpoint status with `complete` and begin `Evidence` with `Implemented:` followed by the verified capability and the next checkpoint.

## C0 — Generic contract v2
Status: complete
Owner: Riya (lead); Akil and Shriya (required reviewers)
Evidence: Implemented: v2 contract types and type-level contract checks verified with `npm run typecheck --workspace @dsrd/contracts` and `npm test -- packages/contracts/test/contracts.test.ts`; Akil and Shriya reviewed the public shapes; moving C1 (Akil), C2 (Riya), and C3 (Shriya) into the parallel phase.
Commit/PR: f8be82c on `feat/service-agnostic`
Remaining work: none
Dependencies: ready; C1-C3 may branch from commit f8be82c.
Blockers: none
Next checkpoint: C1-C3

## C1 — Generic scheduler
Status: complete
Owner: Akil
Evidence: Implemented: generic scheduler, fake platform, v2 artifact, and injected replay verified; moving to C4 and waiting for C2/C3.
Commit/PR: feat/generic-scheduler
Remaining work: none
Dependencies: ready
Blockers: none
Next checkpoint: C4

## C2 — Compose execution platform
Status: not started
Owner: Riya
Evidence: current runtime tests pass against v1 service schedules
Commit/PR: none
Remaining work: implement generic adapter discovery, translation, execution, reset, and replay
Dependencies: staged C0 contract f8be82c
Blockers: none
Next checkpoint: C4

## C3 — Workload proof evidence
Status: not started
Owner: Shriya
Evidence: current proof tests pass for container observations
Commit/PR: none
Remaining work: accept normalized workload observations and preserve deterministic oracle decisions
Dependencies: staged C0 contract f8be82c
Blockers: none
Next checkpoint: C4

## C4 — Compose discovery
Status: blocked
Owner: Akil, Riya, Shriya
Evidence: no generic Compose integration run yet
Commit/PR: none
Remaining work: prove baseline pass and automatic real failure discovery
Dependencies: C1, C2, C3
Blockers: component migrations not complete
Next checkpoint: C5

## C5 — Minimized artifact and replay
Status: blocked
Owner: Akil, Riya, Shriya
Evidence: v1 fake replay passes; generic real replay not run
Commit/PR: none
Remaining work: save v2 artifact and reproduce failure through adapter replay
Dependencies: C4
Blockers: no real generic failure artifact
Next checkpoint: C6

## C6 — Local-process adapter
Status: planned
Owner: Riya, Shriya, Akil
Evidence: not started
Commit/PR: none
Remaining work: add manifest-defined local workloads, proof fixture, and scheduler CLI target selection
Dependencies: stable C4 and C5
Blockers: generic real pipeline not yet stable
Next checkpoint: C7

## C7 — Kubernetes adapter
Status: planned
Owner: Riya, Shriya, Akil
Evidence: not started
Commit/PR: none
Remaining work: admit only after repeatable C4/C5 and a disposable cluster are available
Dependencies: stable C4 and C5
Blockers: Kubernetes is outside MVP delivery
Next checkpoint: none
