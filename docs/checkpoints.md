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
Status: complete
Owner: Akil, Riya, Shriya
Evidence: Implemented: normal pass and automatic generic Compose failure discovery verified; moving to C5. Fresh `npm test && npm run build && npm run typecheck` passed (22 test files, 83 tests); the real Compose integration test verified minimized delayed-Postgres failure timeline evidence.
Commit/PR: feat/generic-compose-integration
Remaining work: none
Dependencies: ready
Blockers: none
Next checkpoint: C5

## C5 — Minimized artifact and replay
Status: complete
Owner: Akil, Riya, Shriya
Evidence: Implemented: minimized v2 artifact and deterministic replay evidence verified; moving to C6. Fresh `npm test && npm run build && npm run typecheck` passed (22 test files, 91 tests); the real Compose integration saved and reloaded the target-aware artifact, replayed its minimized schedule through `ExecutionPlatform.replay`, and reproduced the saved oracle evidence.
Commit/PR: feat/generic-replay (commit reported in checkpoint handoff)
Remaining work: none
Dependencies: ready
Blockers: none
Next checkpoint: C6

## C6 — Local-process adapter
Status: complete
Owner: Riya, Shriya, Akil
Evidence: Implemented: local-process baseline, discovery, minimization, artifact, and replay verified; moving to C7 admission review. Fresh `npm test && npm run build && npm run typecheck` passed (including the local-process normal-pass, discovered failure, minimized artifact, and replay test).
Commit/PR: C6 branch commit (reported after commit)
Remaining work: none
Dependencies: ready
Blockers: none
Next checkpoint: C7

## C7 — Kubernetes adapter
Status: blocked
Owner: Riya, Shriya, Akil
Evidence: Implemented: optional Kubernetes ExecutionPlatform discovery for Deployments, StatefulSets, and Jobs; manifest-scoped reset/replay; per-workload, label-selected startup application; and a Kubernetes proof adapter that delegates failed Job observations to the deterministic workload oracle. Focused runtime and proof tests passed; local Kind verification created the fixture namespace, applied Deployment, StatefulSet, and Job separately, listed the resources, and deleted the disposable namespace.
Commit/PR: feat/kubernetes-adapter
Remaining work: collect Kubernetes resource state/logs in runtime, bind the Kubernetes platform into the executable scheduler path, create the deterministic race fixture, and verify normal startup, discovery, minimization, artifact, and replay.
Dependencies: local kind-dsrd-c7 cluster ready.
Blockers: none
Next checkpoint: C7
