# Repository Onboarding Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete safe repository onboarding without changing established v2 execution behavior.

**Architecture:** Keep the scheduler as the single discovery/minimization/replay authority. Add a shared onboarding orchestration service that resolves checkout/Git input, validates configuration and adapter capability, calls scheduler discovery, and emits public v3 artifacts only after repeated ordered replay. CLI and API become thin adapters over that service.

**Tech Stack:** Node.js, TypeScript, Zod, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-12-scalable-debugger-architecture.md`

## Global Constraints

- Preserve all v2 public contracts and legacy artifact loading.
- Do not execute package scripts during inspection.
- Never serialize secret binding values.
- Treat setup, cleanup, timeout, budget, and inconsistent evidence as non-publishable terminal outcomes.
- Use a fresh owned attempt for every physical Compose/local-process execution.
- Write a failing focused test before each production behavior change and run its focused typecheck afterward.

---

### Task 1: Verified artifact v3 completion

**Files:**
- Modify: `packages/scheduler/src/orchestrator.ts`, `packages/scheduler/src/artifact.ts`
- Test: `packages/scheduler/src/orchestrator.test.ts`, `packages/scheduler/src/artifact.test.ts`

- [ ] Add tests that require retained minimization and replay attempts to match the initial structured failure signature and configured repetition count.
- [ ] Run the focused tests and confirm they fail because the current orchestrator accepts a single replay and does not compare minimized signatures.
- [ ] Pass signature/count evidence into v3 creation only after baseline, confirmation, minimization, and independent replay requirements succeed.
- [ ] Run scheduler tests and scheduler typecheck.

### Task 2: Shared onboarding orchestration

**Files:**
- Create: `packages/scheduler/src/onboarding.ts`
- Modify: `packages/scheduler/src/index.ts`, `packages/scheduler/src/cli.ts`, `packages/api/src/production.ts`, `packages/api/src/run-service.ts`
- Test: `packages/scheduler/src/onboarding.test.ts`, `packages/scheduler/src/cli.test.ts`, `packages/api/src/production.test.ts`, `packages/api/src/run-service.test.ts`

- [ ] Add failing tests for inspect/init/prepare/search/replay status mapping, JSON output, redaction, checkout and pinned-Git inputs, and API terminal outcome propagation.
- [ ] Run focused tests and confirm missing shared operations produce failures.
- [ ] Build the service from `@dsrd/discovery`, contracts, and injected execution-platform creation; use it in both public entry points.
- [ ] Run focused tests and package typechecks.

### Task 3: Local-process safety/conformance completion

**Files:**
- Modify: `packages/runtime/src/local-process-platform.ts`, `packages/runtime/src/local-process-manifest.ts`
- Test: `packages/runtime/test/local-process-platform.test.ts`

- [ ] Add malformed HTTP/TCP target, endpoint-unavailable, readiness-timeout, and descendant-cleanup failing tests.
- [ ] Run focused tests and confirm the uncovered behavior fails.
- [ ] Make the smallest validation/diagnostic/cleanup changes needed while preserving explicit command-array execution.
- [ ] Run runtime tests and runtime typecheck.

### Task 4: Compose isolation completion

**Files:**
- Modify: `packages/runtime/src/compose-platform.ts`, `packages/runtime/src/runtime-controller.ts`, `packages/runtime/src/docker-compose-client.ts`
- Test: `packages/runtime/test/compose-platform.test.ts`, `packages/runtime/test/compose.conformance.test.ts`

- [ ] Add failing external-volume and owned-resource preservation tests.
- [ ] Run focused tests and confirm the unsupported/unsafe condition is not classified correctly.
- [ ] Reject unsafe external mutable volumes without explicit safe configuration; retain fresh attempt ownership and preparation timing.
- [ ] Run runtime tests, typecheck, and Docker-gated conformance.

### Task 5: Documentation and full verification

**Files:**
- Modify: `architecture.md`, `progress.md`, `docs/configuration.md`, `docs/operations.md`, `docs/outcomes.md`, `docs/testing.md`, `docs/runbooks/demo.md`, `docs/integration.md`, `README.md`

- [ ] Update public documentation to match verified behavior and explicit limitations.
- [ ] Run `npm run typecheck`, `npm test`, and `DSRD_DOCKER_CONFORMANCE=1 npm test`.
- [ ] Inspect `git diff origin/dev...HEAD`, Docker resource state, and final git status.
- [ ] Commit each completed logical task and push `feat/repository-onboarding` to origin.
