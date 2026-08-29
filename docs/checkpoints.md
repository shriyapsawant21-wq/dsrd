# Integration Checkpoints

This file is the live source of truth. Update the relevant section immediately after every verification checkpoint.

## C0 — Generic contract v2
Status: in progress
Owner: Akil, Riya, Shriya
Evidence: existing contract v1 passes current typecheck; v2 review pending
Commit/PR: none
Remaining work: approve generic workload, target, schedule, adapter, and artifact v2 shapes
Dependencies: three-owner review and merge
Blockers: public contract migration not approved
Next checkpoint: C1-C3

## C1 — Generic scheduler
Status: blocked
Owner: Akil
Evidence: current scheduler tests pass against v1 fake runner
Commit/PR: none
Remaining work: migrate candidates, minimizer, artifacts, replay, and CLI to workload perturbations
Dependencies: C0 merged
Blockers: Schedule v2 unavailable
Next checkpoint: C4

## C2 — Compose execution platform
Status: blocked
Owner: Riya
Evidence: current runtime tests pass against v1 service schedules
Commit/PR: none
Remaining work: implement generic adapter discovery, translation, execution, reset, and replay
Dependencies: C0 merged
Blockers: ExecutionPlatform v2 unavailable
Next checkpoint: C4

## C3 — Workload proof evidence
Status: blocked
Owner: Shriya
Evidence: current proof tests pass for container observations
Commit/PR: none
Remaining work: accept normalized workload observations and preserve deterministic oracle decisions
Dependencies: C0 merged
Blockers: workload observation contract unavailable
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

