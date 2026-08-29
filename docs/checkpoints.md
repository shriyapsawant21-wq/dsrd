# Integration Checkpoints

This file is the live source of truth. Update the relevant section immediately after every verification checkpoint.

## Execution order

1. C0 is a joint contract checkpoint.
2. C1 (Akil), C2 (Riya), and C3 (Shriya) begin together after C0; they are parallel, not sequential.
3. C4 begins only after C1-C3 are implemented and integrated.
4. C5 follows C4; C6 follows stable C4/C5; C7 is future work after explicit admission.

Every completed owner must replace their checkpoint status with `complete` and begin `Evidence` with `Implemented:` followed by the verified capability and the next checkpoint.

## C0 — Generic contract v2
Status: in progress
Owner: Riya (lead); Akil and Shriya (required reviewers)
Evidence: contracts typecheck and contract test pass; full workspace typecheck fails only in v1 runtime/scheduler consumers
Commit/PR: f8be82c feat: stage generic workload contract v2
Remaining work: migrate C1-C3 consumers, review integrated typecheck, then merge contract v2
Dependencies: Riya and Shriya contract review; then C1, C2, and C3 branches based on f8be82c
Blockers: staged contract must not merge before consumers migrate
Next checkpoint: C1-C3

## C1 — Generic scheduler
Status: not started
Owner: Akil
Evidence: current scheduler tests pass against v1 fake runner
Commit/PR: none
Remaining work: migrate candidates, minimizer, artifacts, replay, and CLI to workload perturbations
Dependencies: staged C0 contract f8be82c
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
