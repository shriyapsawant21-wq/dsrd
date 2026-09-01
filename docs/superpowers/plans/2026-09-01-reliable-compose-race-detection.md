# Reliable Compose Race Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DSRD distinguish proven startup/readiness races from target setup, health, timeout, and flaky-execution outcomes while reliably discovering, minimizing, saving, and replaying the supplied Compose fixture.

**Architecture:** Extend the shared v2 contracts with classified run outcomes and prepare support. Runtime performs non-timed Compose preflight and guarantees cleanup while proof returns deterministic categories from strong evidence. Scheduler applies confidence gates to baselines/candidates/minimization and only serializes a confirmed `race_failure`; API/UI/CLI expose every non-race terminal category.

**Tech Stack:** TypeScript, Node.js, Docker Compose CLI, Vitest, Zod, Commander, Express, React.

**Spec:** `docs/superpowers/specs/2026-09-01-reliable-compose-race-detection-design.md`

## Global Constraints

- Any contributor may work on any package; retain scheduler/runtime/proof package boundaries.
- `packages/contracts/src/index.ts` is the sole source of `Schedule`, `RunResult`, `TimelineEvent`, and `FailureArtifact`.
- Do not classify a log string alone as `race_failure`.
- Docker image pull/build time must not consume a schedule execution timeout.
- Only a confirmed, minimized, replayable `race_failure` may create `failure.json`.
- Replay must call the same platform/runtime/proof path as discovery.
- Never use broad Docker cleanup; clean only the target Compose project.
- Preserve the existing uncommitted Kubernetes CLI changes and local-process fixture state unless a task explicitly needs them.

---

### Task 1: Classify public execution outcomes and artifacts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts-v2.typecheck.ts`
- Modify: `packages/contracts/test/contracts.test.ts`
- Modify: `packages/scheduler/src/artifact.ts`
- Modify: `packages/scheduler/src/artifact.test.ts`

**Interfaces:**
- Produce `RunStatus = "pass" | "race_failure" | "execution_error" | "target_unhealthy" | "inconclusive"`.
- Extend `RunResult` with the classified status and optional structured diagnostic/evidence fields.
- Extend `FailureArtifact` with `expectedStatus: "race_failure"`; artifacts remain v2 and use `Schedule.perturbations`.
- Add optional `prepare(target): Promise<RunResult | void>` to `ExecutionPlatform` only if needed to propagate preflight classifications without local adapter types.

- [ ] **Step 1: Write failing contract and artifact tests** for each legal status, rejection of non-race artifact expectations, and round-trip v2 perturbations.
- [ ] **Step 2: Run** `npm test -- --run packages/contracts packages/scheduler/src/artifact.test.ts` **and confirm the tests fail for the missing status/schema behavior.**
- [ ] **Step 3: Add the minimal shared types and Zod artifact schema migration.** Keep all optional details serializable and secret-free.
- [ ] **Step 4: Update every contract-only consumer that TypeScript exposes.** Do not leave compatibility aliases for `"fail"`.
- [ ] **Step 5: Run** `npm run typecheck --workspace @dsrd/contracts && npm test -- --run packages/contracts packages/scheduler/src/artifact.test.ts`.
- [ ] **Step 6: Commit** `feat(contracts): classify execution outcomes`.

### Task 2: Make proof evidence deterministic and readiness-aware

**Files:**
- Modify: `packages/proof/src/oracle/evaluate.ts`
- Modify: `packages/proof/src/oracle/types.ts`
- Modify: `packages/proof/src/runtime-proof-observer.ts`
- Modify: `packages/proof/src/compose-proof-observer.ts`
- Modify: `packages/proof/src/probes/http.ts`
- Modify: `packages/proof/src/probes/tcp.ts`
- Test: `packages/proof/test/workload-evidence.test.ts`
- Test: `packages/proof/test/log-parser.test.ts`
- Test: `packages/proof/test/compose-proof-observer.test.ts`
- Test: `packages/proof/test/http.test.ts`
- Test: `packages/proof/test/tcp.test.ts`

**Interfaces:**
- Consume `WorkloadObservationSnapshot` containing states, health, probes, structured workload events, logs, and terminal jobs.
- Produce only shared `RunResult` categories.

- [ ] **Step 1: Write failing tests** proving `ECONNREFUSED`, `connection refused`, and `timeout` logs alone produce diagnostic timeline evidence but never `race_failure`.
- [ ] **Step 2: Write failing tests** for a structured application failure event, non-zero terminal job exit, unhealthy Docker health state, and failed HTTP/TCP readiness each producing `race_failure` with strong evidence.
- [ ] **Step 3: Write failing tests** for all-running-but-not-ready service, incomplete observations, and a healthy terminal job; assert `target_unhealthy`, `inconclusive`, and `pass` respectively.
- [ ] **Step 4: Run focused proof tests** and confirm RED.
- [ ] **Step 5: Implement classification precedence:** explicit strong failure, terminal exit/health/probe failure, complete healthy pass, then target-unhealthy/inconclusive. Retain parsed logs only as timeline diagnostics.
- [ ] **Step 6: Make the observer poll until a terminal job and configured readiness have meaningful observations; pass Docker health into Compose proof snapshots.**
- [ ] **Step 7: Run** `npm test -- --run packages/proof` **and** `npm run typecheck --workspace @dsrd/proof`.
- [ ] **Step 8: Commit** `feat(proof): require strong race evidence`.

### Task 3: Add Compose preflight and reliable classified cleanup

**Files:**
- Modify: `packages/runtime/src/docker-compose-client.ts`
- Modify: `packages/runtime/src/compose-platform.ts`
- Modify: `packages/runtime/src/runtime-controller.ts`
- Modify: `packages/runtime/src/command-runner.ts`
- Modify: `packages/runtime/src/observer.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `packages/runtime/test/docker-compose-client.test.ts`
- Test: `packages/runtime/test/compose-platform.test.ts`
- Test: `packages/runtime/test/runtime-controller.test.ts`
- Test: `packages/runtime/test/command-runner.test.ts`

**Interfaces:**
- `DockerComposeClient.prepare()` validates with `docker compose config`, then pulls/builds before experiment timing, with abortable preflight timeout.
- `ComposeExecutionPlatform.prepare(target)` returns a classified execution result rather than throwing a target setup failure.
- `DockerRuntimeController.runSchedule()` returns `execution_error` for command, timeout, operation-drain, and cleanup failures after attempting all cleanup steps.

- [ ] **Step 1: Write failing client tests** for exact Compose preflight commands, configured compose file/cwd, build/pull not being passed the run abort signal, and preserved command diagnostics.
- [ ] **Step 2: Write failing platform tests** for invalid/missing Compose config and preflight command failure producing `execution_error`, never `race_failure`.
- [ ] **Step 3: Write failing controller tests** for reset, start, collect, observe, timeout, drain timeout, readiness-delay clear, and stop failures. Each test must assert cleanup attempts and the `execution_error` result with diagnostic timeline detail.
- [ ] **Step 4: Run focused runtime tests and confirm RED.**
- [ ] **Step 5: Implement `prepare` with a separately configurable preflight timeout and explicit Compose file resolution/validation.** Build/pull succeeds before the first baseline timer starts.
- [ ] **Step 6: Convert runtime exceptions to classified results at the platform boundary, while retaining programmer/configuration validation exceptions only where callers supplied an invalid API shape.** Ensure `finally` cleanup covers all physical run paths.
- [ ] **Step 7: Record Compose health and terminal-job state in snapshots; add timeout events to the timeline.**
- [ ] **Step 8: Run** `npm test -- --run packages/runtime && npm run typecheck --workspace @dsrd/runtime`.
- [ ] **Step 9: Commit** `feat(runtime): preflight compose targets and classify execution errors`.

### Task 4: Preserve baseline Compose semantics and make perturbation observable

**Files:**
- Modify: `packages/runtime/src/runtime-controller.ts`
- Modify: `packages/runtime/src/readiness-delay.ts`
- Modify: `packages/scheduler/src/default-platform.ts`
- Modify: `packages/runtime/src/compose-platform.ts`
- Test: `packages/runtime/test/runtime-controller.test.ts`
- Test: `packages/runtime/test/compose-platform.test.ts`
- Test: `packages/runtime/test/replay.test.ts`

**Interfaces:**
- Baseline starts preserve Compose `depends_on` behavior.
- A nonzero start perturbation switches to explicit controlled starts with `--no-deps` only for that run.
- A supported ready perturbation installs/removes a concrete adapter and emits a `scheduled_readiness_delay` event.

- [ ] **Step 1: Write failing tests** for baseline starts including dependencies, perturbed starts using `--no-deps`, and emitted events ordering the applied delay before dependency failure.
- [ ] **Step 2: Write a failing test** that configured ready perturbations reach the concrete adapter and are cleared after pass, error, timeout, and replay.
- [ ] **Step 3: Run the focused tests and confirm RED.**
- [ ] **Step 4: Implement the baseline/perturbed start decision and connect the fixture-compatible readiness delay adapter in the default Compose platform.**
- [ ] **Step 5: Ensure platform replay delegates to exactly `runSchedule`, not a separate physical execution path.**
- [ ] **Step 6: Run runtime tests and typecheck.**
- [ ] **Step 7: Commit** `feat(runtime): observe controlled compose perturbations`.

### Task 5: Add baseline and candidate confidence gates to scheduler

**Files:**
- Modify: `packages/scheduler/src/search.ts`
- Modify: `packages/scheduler/src/orchestrator.ts`
- Modify: `packages/scheduler/src/minimize.ts`
- Modify: `packages/scheduler/src/candidates.ts` only if baseline schedules must be generated there
- Test: `packages/scheduler/src/search.test.ts`
- Test: `packages/scheduler/src/orchestrator.test.ts`
- Test: `packages/scheduler/src/minimize.test.ts`

**Interfaces:**
- `DiscoverFailureOptions` accepts `baselineRuns` and `candidateConfirmationRuns`, defaulting to 3.
- `DiscoveryResult` exposes `found_failure`, `no_failure`, `execution_error`, `target_unhealthy`, or `inconclusive` with tested count and diagnostics.
- Minimization receives a confirmation predicate that proves the same categorized race after removal/reduction.

- [ ] **Step 1: Write failing tests** for three baseline passes before candidate exploration, baseline `execution_error`, baseline `target_unhealthy`, and alternating baseline results becoming `inconclusive`.
- [ ] **Step 2: Write failing tests** for candidate confirmation thresholds, alternating candidate pass/race failures becoming `inconclusive`, and non-race classifications stopping search without artifacts.
- [ ] **Step 3: Write failing minimization tests** demonstrating each perturbation removal is tested, reduced delay is tested, and only confirmed same-category races remain.
- [ ] **Step 4: Run focused scheduler tests and confirm RED.**
- [ ] **Step 5: Implement a reusable confirmation helper** that counts exact statuses, preserves diagnostics/events, and never treats `execution_error` as candidate evidence.
- [ ] **Step 6: Invoke platform preflight once before baselines, then run baseline confirmation before schedule generation.**
- [ ] **Step 7: Update minimization and final confirmation to use the helper; return `inconclusive` on instability and avoid artifact construction.**
- [ ] **Step 8: Run** `npm test -- --run packages/scheduler && npm run typecheck --workspace @dsrd/scheduler`.
- [ ] **Step 9: Commit** `feat(scheduler): require reproducible race evidence`.

### Task 6: Enforce category-and-timeline replay verification

**Files:**
- Modify: `packages/scheduler/src/orchestrator.ts`
- Modify: `packages/scheduler/src/artifact.ts`
- Modify: `packages/scheduler/src/presentation.ts`
- Test: `packages/scheduler/src/orchestrator.test.ts`
- Test: `packages/scheduler/src/presentation.test.ts`

**Interfaces:**
- `replayFailure()` requires `race_failure`, artifact expected category/reason, and meaningful ordering evidence, not merely matching event names.
- Replay result distinguishes `reproduced`, `not_reproduced`, and an observed non-race terminal category.

- [ ] **Step 1: Write failing tests** for pass-vs-race replay mismatch, execution-error replay, reason mismatch, missing dependency-before-failure ordering, and a matching replay.
- [ ] **Step 2: Run focused scheduler tests and confirm RED.**
- [ ] **Step 3: Implement ordered evidence matching** using service/event occurrence order and record an explanatory replay mismatch diagnostic.
- [ ] **Step 4: Update text rendering so non-race replay outcomes are not labelled failures.**
- [ ] **Step 5: Run scheduler tests and typecheck.**
- [ ] **Step 6: Commit** `feat(scheduler): verify replayed race evidence`.

### Task 7: Surface classifications and controls through CLI, API, and UI

**Files:**
- Modify: `packages/scheduler/src/cli.ts`
- Modify: `packages/scheduler/src/cli.test.ts`
- Modify: `packages/scheduler/src/presentation.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/api/src/run-service.ts`
- Modify: `packages/api/src/run-store.ts`
- Modify: `packages/api/src/app.ts`
- Test: `packages/api/src/contracts.test.ts`
- Test: `packages/api/src/run-service.test.ts`
- Test: `packages/api/src/app.test.ts`
- Modify: `packages/web/src/api.ts`
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/api.test.ts`

**Interfaces:**
- CLI options: `--run-timeout-ms`, `--readiness-timeout-ms`, `--preflight-timeout-ms`, `--baseline-runs`, and `--candidate-confirmation-runs` with validated positive values and documented defaults.
- API `RunPhase` and web state retain `execution_error`, `target_unhealthy`, and `inconclusive` terminal categories.

- [ ] **Step 1: Write failing CLI tests** for option parsing/validation, preflight reporting, no artifact on non-race outcome, and clear inconclusive/target-unhealthy output.
- [ ] **Step 2: Write failing API/web tests** for each terminal category, SSE terminal event, and absence of a failure-report row unless an artifact exists.
- [ ] **Step 3: Run targeted scheduler/API/web tests and confirm RED.**
- [ ] **Step 4: Thread options into the default platform factory without mutable module-global configuration.**
- [ ] **Step 5: Add API progress states and UI screens/copy for target setup failed, target unhealthy, and inconclusive.**
- [ ] **Step 6: Run** `npm test -- --run packages/scheduler/src/cli.test.ts packages/api packages/web && npm run typecheck`.
- [ ] **Step 7: Commit** `feat(surfaces): report non-race terminal outcomes`.

### Task 8: Repair fixture, test discovery, and documentation

**Files:**
- Modify: `fixtures/startup-race/schedules/postgres-startup-race.json`
- Modify: `fixtures/startup-race/compose.yaml`
- Modify: fixture Dockerfiles/scripts only if required for a concrete readiness delay implementation
- Modify: `integration/compose-discovery.test.ts`
- Create or modify: `vitest.config.ts` (or package-level Vitest configuration)
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/runbooks/demo.md`
- Modify: `fixtures/startup-race/README.md`

**Interfaces:**
- Fixture schedule is `{ id, perturbations }` with a supported Compose delay mechanism.
- Compose integration test explicitly skips when Docker/Compose is unavailable and reports the reason.

- [ ] **Step 1: Write a failing fixture schema test** rejecting the old `services` schedule shape and accepting the v2 perturbation artifact.
- [ ] **Step 2: Write a Docker-availability helper and integration test gate.** On no Docker/Compose, use `describe.skipIf` (or equivalent) with an explicit skip reason; do not silently pass.
- [ ] **Step 3: Add Vitest exclusions** for `**/.worktrees/**`, nested checkout directories, `node_modules`, and generated build output. Write a configuration test or verify discovered test files do not include a temporary nested-worktree fixture.
- [ ] **Step 4: Update the supplied Compose fixture** so default dependency-gated baseline is healthy and the production schedule delays PostgreSQL readiness/start sufficiently for API’s one-shot DB connection to fail through the strong oracle path.
- [ ] **Step 5: Update README, fixture README, runbook, and CLI help** with preflight behavior, timeout settings, confirmation defaults, inconclusive outcomes, and limitations for slow/missing-probe third-party targets.
- [ ] **Step 6: Run fixture unit tests, discovery test (Docker-dependent), and test-discovery verification.**
- [ ] **Step 7: Commit** `fix(fixture): provide v2 reproducible compose race`.

### Task 9: Perform end-to-end verification and record exact evidence

**Files:**
- Create: `reports/verification/2026-09-01-reliable-race-detection.md`
- Modify only if verification reveals a tested defect.

- [ ] **Step 1: Run fresh** `npm run typecheck` **and capture exit code/output summary.**
- [ ] **Step 2: Run fresh** `npm test` **and record the test count plus confirmation that nested `.worktrees` were excluded.**
- [ ] **Step 3: Run the local-process golden flow:** `npm run build:execution && node packages/scheduler/dist/main.js search --platform local-process --target fixtures/local-startup-race --output /tmp/dsrd-local-failure.json`, then replay that artifact. Inspect it for v2 perturbations and `race_failure` expected status.
- [ ] **Step 4: Check Docker/Compose availability.** If available, run the Compose full flow twice with explicit paths, production CLI, conservative confirmations, and separate `/tmp` artifacts; replay each artifact. If unavailable, record the exact availability check and explicit test skip reason.
- [ ] **Step 5: Inspect Compose timelines** to confirm delay/dependency-not-ready evidence occurs before API/worker strong failure evidence; inspect cleanup with `docker compose ps` scoped to the fixture.
- [ ] **Step 6: Write the verification report** with exact commands, exit codes, test counts, artifact paths, and remaining third-party limitations.
- [ ] **Step 7: Run** `git diff --check`, review all changed consumers for contract consistency, and commit `docs: record reliable race verification` only after the evidence is fresh.
