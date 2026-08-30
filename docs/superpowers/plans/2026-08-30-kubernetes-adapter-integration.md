# Kubernetes Adapter Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete optional Kubernetes discovery, proof, scheduler orchestration, artifact replay, and a Kind-gated race fixture.

**Architecture:** Runtime gathers Kubernetes lifecycle observations through `kubectl`; proof maps them to the existing oracle; scheduler receives an injected Kubernetes platform and never imports Kubernetes tooling. The fixture uses a failed dependent Job as the machine-verifiable race signal.

**Tech Stack:** TypeScript, Vitest, `kubectl`, Kind, existing shared contracts.

**Spec:** `docs/superpowers/specs/2026-08-30-kubernetes-adapter-integration-design.md`

## Global Constraints

- No Kubernetes dependency is required for Compose or local-process development.
- Only the proof observer decides `RunResult.status`.
- Kubernetes execution errors reject rather than create failure results.
- Artifacts contain the generic Kubernetes target only, never credentials.

### Task 1: Runtime observations

**Files:** `packages/runtime/src/kubernetes-platform.ts`, `packages/runtime/test/kubernetes-platform.test.ts`

- [ ] Write a red test for resource-state and log collection delegated to an injected observer.
- [ ] Run `npx vitest run packages/runtime/test/kubernetes-platform.test.ts` and confirm the observer API is absent.
- [ ] Add minimal kubectl JSON/log collection and observer delegation.
- [ ] Re-run the focused test.

### Task 2: Proof adapter

**Files:** `packages/proof/src/kubernetes-proof-observer.ts`, `packages/proof/src/index.ts`, `packages/proof/test/kubernetes-proof-observer.test.ts`

- [ ] Write a red test where a failed Kubernetes Job is classified by `WorkloadProofObserver`.
- [ ] Run `npx vitest run packages/proof/test/kubernetes-proof-observer.test.ts` and confirm the adapter is absent.
- [ ] Implement the minimal normalized-observation adapter.
- [ ] Re-run the focused test.

### Task 3: Scheduler and fixture integration

**Files:** `packages/scheduler` Kubernetes platform selection/integration test, `fixtures/kubernetes-startup-race`, `docs/checkpoints.md`

- [ ] Write a red target-aware discovery/minimize/replay test using an injected Kubernetes platform.
- [ ] Run the focused test and confirm missing selection/fixture behavior.
- [ ] Implement only generic platform injection and the Kind-gated fixture test path.
- [ ] Verify normal pass, discovered failure, minimization, artifact, and replay when `KUBERNETES_C7_INTEGRATION=1`.

### Task 4: Handoff

- [ ] Run focused tests, Kind integration, `npm test && npm run build && npm run typecheck`, checkpoint scan, and `git diff --check`.
- [ ] Update C7 with fresh evidence, commit only C7-owned changes, and report the hash.
