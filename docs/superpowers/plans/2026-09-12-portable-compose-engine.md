# Portable Compose Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first runnable architecture phase: a reliable Compose engine that can prepare an external Compose project, establish a healthy baseline, confirm strong schedule-induced failures, minimize them, and replay the result.

**Architecture:** The shared contracts distinguish physical execution from an experiment verdict. Runtime owns preparation, isolated Compose project lifecycle, and cleanup; proof owns machine-verifiable evidence; scheduler owns baseline/candidate confirmation, budgets, minimization, and replay. CLI and API call the same coordinator entry point.

**Tech Stack:** TypeScript, Node.js, Docker Compose CLI, Vitest, Zod, Commander, Express, React.

**Spec:** `docs/superpowers/specs/2026-09-12-scalable-debugger-architecture.md`

## Global Constraints

- `packages/contracts/src/index.ts` remains the only source of public contracts.
- A log string alone never establishes a workload failure or a discovered race.
- Pull/build/preflight time does not consume a physical run timeout.
- The default dependency policy preserves the target's declared Compose conditions.
- Every physical path attempts cleanup of exactly the attempt-owned Compose project.
- A verified artifact is written only after repeated baseline/candidate evidence, minimization, and independent replay.
- Tests run only in the primary checkout; they exclude `.worktrees`, nested repositories, `node_modules`, and build output.

---

### Task 1: Isolate Vitest discovery

**Files:**
- Create: `vitest.config.ts`
- Test: `packages/contracts/test/contracts.test.ts` as a control test through the root script.

**Interfaces:**
- Root `npm test` discovers test files only under this checkout's `packages/` and `fixtures/` paths.

- [x] Write a root Vitest configuration whose `test.exclude` contains `**/.worktrees/**`, `**/node_modules/**`, and `**/dist/**` in addition to Vitest defaults.
- [x] Run `npx vitest run packages/contracts` from the repository root and observe the pre-change output include a contracts test from each nested worktree.
- [x] Add the automatically loaded root configuration.
- [x] Run `npx vitest run packages/contracts` and verify exactly one contracts test file executes.
- [x] Run `npm test` and verify no output path begins `.worktrees/`.
- [x] Commit `test: isolate primary checkout discovery`.

### Task 2: Classify physical runs in shared contracts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts-v2.typecheck.ts`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: all `RunResult` construction sites surfaced by `npm run typecheck`.

**Interfaces:**

```ts
export type PhysicalRunStatus =
  | "healthy"
  | "workload_failure"
  | "execution_error"
  | "inconclusive"
  | "cancelled";
export type RunDiagnostic = { code: string; message: string };
export type RunResult = {
  scheduleId: string;
  status: PhysicalRunStatus;
  events: TimelineEvent[];
  logs: string[];
  failureReason?: string;
  diagnostics?: RunDiagnostic[];
};
```

- [x] Add a failing contract test requiring `healthy`, `workload_failure`, and `execution_error` to be accepted and legacy `pass`/`fail` to be rejected.
- [x] Run the focused contract test and confirm it fails because the new statuses are not assignable.
- [x] Add the shared types above and update direct shared-contract type assertions.
- [x] Migrate every production and test `RunResult` literal from `pass`/`fail` to the corresponding physical status, retaining failure reasons only for workload failures.
- [x] Run `npm run typecheck` and `npx vitest run packages/contracts`; both must pass.
- [x] Commit `feat(contracts): classify physical run outcomes`.

### Task 3: Require strong proof evidence

**Files:**
- Modify: `packages/proof/src/oracle/evaluate.ts`
- Modify: `packages/proof/src/logs/parse.ts`
- Modify: `packages/proof/src/runtime-proof-observer.ts`
- Test: `packages/proof/test/log-parser.test.ts`
- Test: `packages/proof/test/workload-evidence.test.ts`

**Interfaces:**
- `parseLogEvidence()` returns timeline diagnostics for generic connection/timeout text but no proof-failure input for those strings.
- `evaluateWorkloadRun()` returns `healthy`, `workload_failure`, or `inconclusive` from workload state, declared readiness, and structured application events.

- [x] Add a test proving a single `ECONNREFUSED` or `timeout` log with otherwise incomplete evidence returns `inconclusive` and keeps a timeline event.
- [x] Run that test and confirm the existing log-failure branch returns `workload_failure`.
- [x] Remove generic log categories from the failure decision while preserving their event parsing.
- [x] Add tests for non-zero exit, failed health/readiness, and explicit structured failure event returning `workload_failure`; add a complete successful fixture returning `healthy`.
- [x] Run `npx vitest run packages/proof/test/log-parser.test.ts packages/proof/test/workload-evidence.test.ts` and `npm run typecheck --workspace=@dsrd/proof`.
- [x] Commit `feat(proof): require machine-verifiable failures`.

### Task 4: Prepare and isolate Compose execution

**Files:**
- Modify: `packages/runtime/src/docker-compose-client.ts`
- Modify: `packages/runtime/src/runtime-controller.ts`
- Modify: `packages/runtime/src/compose-platform.ts`
- Modify: `packages/runtime/src/default-platform.ts` if router construction needs target preparation.
- Test: `packages/runtime/test/docker-compose-client.test.ts`
- Test: `packages/runtime/test/runtime-controller.test.ts`
- Test: `packages/runtime/test/compose-platform.test.ts`

**Interfaces:**

```ts
interface ComposeRuntime {
  prepare(signal?: AbortSignal): Promise<void>;
  resetStack(signal?: AbortSignal): Promise<void>;
  startService(service: string, options?: { includeDependencies?: boolean; signal?: AbortSignal }): Promise<void>;
  collectLogs(signal?: AbortSignal): Promise<string[]>;
  listServices(signal?: AbortSignal): Promise<ComposeServiceState[]>;
  stopStack(signal?: AbortSignal): Promise<void>;
}
```

- [ ] Add a client test expecting `docker compose config --quiet`, then image acquisition/build commands during `prepare`, before any `up` command.
- [ ] Run it and confirm `prepare` is absent.
- [ ] Implement `prepare()` with a separate signal and make measured starts use `--no-build` and `--pull never`; record the Compose project name in every command.
- [ ] Add a controller test where a start, observer, timeout, or cleanup action fails and assert the returned `execution_error` contains a diagnostic and the exact owned stack is stopped.
- [ ] Run it and confirm current behavior rejects/throws instead of returning a classified result.
- [ ] Convert operational errors, command timeouts, and cleanup failures to `execution_error`; leave invalid API schedule validation as programmer errors. Clear injected readiness delays and stop the stack in every outcome.
- [ ] Add tests proving an empty schedule preserves Compose dependency handling and a requested delay is recorded with scheduled and actual-start events.
- [ ] Run focused runtime tests and `npm run typecheck --workspace=@dsrd/runtime`.
- [ ] Commit `feat(runtime): prepare and isolate compose attempts`.

### Task 5: Preserve conditioned workload metadata and validate capabilities

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/runtime/src/compose-platform.ts`
- Modify: `packages/runtime/test/compose-platform.test.ts`
- Modify: `packages/scheduler/src/default-platform.ts`

**Interfaces:**

```ts
export type DependencyEdge = {
  workloadId: string;
  condition: "service_started" | "service_healthy" | "service_completed_successfully";
  provenance: "declared" | "configured";
};
export type Workload = { /* existing fields */ dependencyEdges?: DependencyEdge[] };
```

- [ ] Add a discovery test with short and long `depends_on` syntax and literal expected dependency-edge conditions.
- [ ] Run it and confirm discovery currently retains only dependency IDs.
- [ ] Parse and normalize both syntaxes; preserve declared dependency gates in the workload model.
- [ ] Add a test that rejects a readiness perturbation unless the platform advertises a concrete readiness-delay capability.
- [ ] Run runtime contracts/platform tests and typecheck.
- [ ] Commit `feat(runtime): retain compose dependency capabilities`.

### Task 6: Add baseline confirmation and experiment outcomes

**Files:**
- Modify: `packages/scheduler/src/search.ts`
- Modify: `packages/scheduler/src/orchestrator.ts`
- Modify: `packages/scheduler/src/minimize.ts`
- Modify: `packages/scheduler/src/artifact.ts`
- Test: `packages/scheduler/src/orchestrator.test.ts`
- Test: `packages/scheduler/src/search.test.ts`
- Test: `packages/scheduler/src/minimize.test.ts`
- Test: `packages/scheduler/src/artifact.test.ts`

**Interfaces:**

```ts
type ExperimentStatus =
  | "found_failure" | "no_failure" | "target_unhealthy"
  | "execution_error" | "inconclusive";
type DiscoverFailureOptions = {
  baselineRuns?: number;
  confirmationRuns?: number;
  maxExecutions?: number;
  prepare?: () => Promise<RunResult | void>;
  // existing target, candidates, delayOptionsMs, runSchedule fields
};
```

- [ ] Add a failing test showing a failed empty schedule returns `target_unhealthy` and creates no artifact.
- [ ] Add a failing test showing three healthy baselines precede a candidate, three matching workload failures are required, and a mixed confirmation returns `inconclusive`.
- [ ] Run focused scheduler tests and confirm current search accepts the baseline or a single candidate failure.
- [ ] Implement a confirmation helper that counts physical executions, accepts exact required statuses, and preserves diagnostics. Use it before search, while minimizing, and before artifact publication.
- [ ] Enforce `maxExecutions` for every physical baseline, confirmation, minimization, and replay attempt; return `inconclusive` if verification cannot fit the remaining budget.
- [ ] Extend `FailureArtifact` with expected physical failure status, source-independent ordering constraints, and v3 schema validation while retaining a legacy v2 loader.
- [ ] Run scheduler tests and typecheck.
- [ ] Commit `feat(scheduler): confirm portable race evidence`.

### Task 7: Verify ordered replay and expose outcomes

**Files:**
- Modify: `packages/scheduler/src/orchestrator.ts`
- Modify: `packages/scheduler/src/presentation.ts`
- Modify: `packages/scheduler/src/cli.ts`
- Modify: `packages/scheduler/src/cli.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/api/src/run-service.ts`
- Modify: `packages/api/src/production.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/web/src/api.ts`
- Test: `packages/scheduler/src/orchestrator.test.ts`
- Test: `packages/scheduler/src/cli.test.ts`
- Test: `packages/api/src/app.test.ts`

**Interfaces:**
- `replayFailure()` returns `reproduced` only when it sees `workload_failure`, matching signature, and ordered required evidence.
- CLI/API terminal states use `ExperimentStatus`; only `found_failure` exposes an artifact.

- [ ] Add a failing replay test with the same event names in reverse order; assert `not_reproduced`.
- [ ] Run it and confirm current replay accepts an unordered event multiset.
- [ ] Implement ordered subsequence matching by service/event occurrence, then compare expected failure status/reason before returning `reproduced`.
- [ ] Add CLI/API tests for `target_unhealthy`, `execution_error`, and `inconclusive`; assert they do not claim a race or serialize an artifact.
- [ ] Add CLI options `--baseline-runs`, `--confirmation-runs`, `--preflight-timeout`, `--run-timeout`, and `--readiness-timeout`, with positive-integer validation and display of physical/unique execution counts.
- [ ] Run scheduler/API tests and typecheck.
- [ ] Commit `feat(interface): report verified experiment outcomes`.

### Task 8: Verify the portable Compose path

**Files:**
- Modify: `docs/runbooks/demo.md`
- Modify: `README.md`
- Test: `packages/runtime/test/compose-platform.test.ts` and a Docker-gated integration test under `integration/`.

- [ ] Add a Docker-gated integration test that creates a unique Compose project, runs preflight, proves three healthy baselines, discovers/minimizes a supported failure, replays it three times, and checks exact resource cleanup.
- [ ] Mark the test skipped with an explicit reason only when Docker is unavailable; never skip a runtime failure.
- [ ] Update the runbook with `inspect`, preflight, confirmation controls, statuses, artifact version, and third-party target requirements.
- [ ] Run `npm run typecheck`, `npm test`, and the local-process plus Compose golden discovery/replay commands from the isolated worktree.
- [ ] Record commands, output counts, artifact paths, and Docker cleanup evidence in `docs/checkpoints.md`.
- [ ] Commit `docs: verify portable compose engine`.

## Plan self-review

The eight tasks cover the architecture's local first phase: test isolation, shared classification, deterministic proof, preflight/isolation, conditioned target discovery, confirmation/minimization/artifacts, shared interfaces, and real Compose verification. Distributed workers, durable cross-host storage, local-process expansion, and Kubernetes hardening remain later architecture phases because they depend on this common protocol and conformance suite.
