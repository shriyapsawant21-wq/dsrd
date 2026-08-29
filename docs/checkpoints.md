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
Status: complete
Owner: Riya
Evidence: Implemented: Compose platform discovery, generic schedule translation, reset, run, and replay verified; moving to C4 and waiting for C1/C3.
Commit/PR: c3af2b7
Remaining work: none
Dependencies: ready
Blockers: none
Next checkpoint: C4

## C3 — Workload proof evidence
Status: complete
Owner: Shriya
Evidence: Implemented: workload-normalized proof and timeline evidence verified with deterministic oracle behavior preserved using `npm test -- packages/proof` (22 passed) and `npm run typecheck --workspace @dsrd/proof`; moving to C4 and waiting for C1/C2.
Commit/PR: `feat/workload-proof` checkpoint commit
Remaining work: none
Dependencies: C1 generic scheduler is complete; waiting on C2 Compose execution platform
Blockers: none
Next checkpoint: C4

## C4 — Compose discovery
Status: blocked
Owner: Akil, Riya, Shriya
Evidence: Blocked: `fixtures/startup-race/scripts/verify-race.ps1` requires `docker compose up -d --no-deps postgres` and `docker compose up -d --no-deps api`, but Riya's reusable `DockerComposeClient.startService` only issues `docker compose up -d <service>`; the fixture README also records that the controller's pre-observation snapshot can be stale.
Commit/PR: none
Remaining work: waiting for Riya to provide generic scheduled service startup without Compose dependency auto-start and a terminal refreshed observation snapshot; then prove baseline pass and automatic real failure discovery.
Dependencies: waiting on Riya runtime output: generic `--no-deps` scheduled startup plus terminal refreshed observations for the shared proof oracle.
Blockers: Riya-owned runtime integration is incomplete despite C2 being marked complete; no generic Compose execution can induce the fixture's intentional race or provide reliable final proof evidence.
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
