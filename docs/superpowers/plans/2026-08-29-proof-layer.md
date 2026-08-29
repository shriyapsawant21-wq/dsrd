# Proof Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic three-service startup-race fixture and proof package that converts runtime observations into shared, timeline-rich `RunResult` values.

**Architecture:** A real PostgreSQL service exposes a deterministic process-delay hook, the API performs one database attempt without retry, and the worker performs one API request. Separate HTTP/TCP probes and a pure oracle turn runtime observations into stable evidence without issuing Docker commands or using an LLM.

**Tech Stack:** Node.js 24, TypeScript, npm workspaces, Vitest, Express, `pg`, Docker Compose, official PostgreSQL image

**Spec:** `docs/superpowers/specs/2026-08-29-proof-layer-design.md`

## Global Constraints

- Use the shared types from `packages/contracts`; do not create local copies of `Schedule`, `TimelineEvent`, `RunResult`, or `FailureArtifact`.
- Do not implement schedule search, minimization, replay serialization, Docker lifecycle control, or delay-injection policy.
- Pass/fail classification must be deterministic and must not use an LLM.
- Normal Compose startup must pass; failure must occur only when PostgreSQL startup is deliberately delayed and the API is deliberately started before readiness.
- New behavior is implemented with a failing test first and verified after the minimal implementation.

---

### Task 1: Workspace and Shared Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Produces: `ServiceSchedule`, `Schedule`, `TimelineEvent`, `RunResult`, `FailureArtifact` exactly as documented in `docs/contracts/shared-contracts.md`.

- [ ] **Step 1: Write the failing shared-contract test**

Create a compile/runtime smoke test that constructs a literal `RunResult`, asserts `status === "pass"`, and imports the type from `@dsrd/contracts`.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test -- packages/contracts/test/contracts.test.ts`

Expected: failure because the root workspace, test runner, and contracts package do not exist.

- [ ] **Step 3: Add minimal workspace configuration and exact contracts**

The root workspace includes `packages/*` and `fixtures/startup-race/*`, uses ESM, and provides `test`, `typecheck`, and `build` scripts. The contract source contains the exact five public shapes from the approved shared-contract document, with no additional required fields.

- [ ] **Step 4: Install dependencies and verify GREEN**

Run: `npm install`

Run: `npm test -- packages/contracts/test/contracts.test.ts`

Expected: one passing contract smoke test.

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages/contracts
git commit -m "chore: add workspace and shared contracts"
```

### Task 2: API and Worker Fixture Behavior

**Files:**
- Create: `fixtures/startup-race/api/package.json`
- Create: `fixtures/startup-race/api/tsconfig.json`
- Create: `fixtures/startup-race/api/src/app.ts`
- Create: `fixtures/startup-race/api/src/main.ts`
- Create: `fixtures/startup-race/api/test/app.test.ts`
- Create: `fixtures/startup-race/api/Dockerfile`
- Create: `fixtures/startup-race/worker/package.json`
- Create: `fixtures/startup-race/worker/tsconfig.json`
- Create: `fixtures/startup-race/worker/src/run-worker.ts`
- Create: `fixtures/startup-race/worker/src/main.ts`
- Create: `fixtures/startup-race/worker/test/run-worker.test.ts`
- Create: `fixtures/startup-race/worker/Dockerfile`

**Interfaces:**
- Produces: `initializeApi(connectOnce, emit): Promise<Express>`.
- Produces: `runWorker(fetchImpl, apiUrl, emit): Promise<void>`.
- Emits structured JSON events with `service`, `event`, and optional `detail`.

- [ ] **Step 1: Write failing API tests**

Tests exercise real Express behavior through a local ephemeral HTTP server. They assert that a successful injected `connectOnce` permits `/health` to return `{ status: "ok" }`, and that a rejected `connectOnce` causes initialization to reject after exactly one attempt and emits `db_connection_failed`.

- [ ] **Step 2: Verify API tests RED**

Run: `npm test -- fixtures/startup-race/api/test/app.test.ts`

Expected: module-not-found failure for `src/app.ts`.

- [ ] **Step 3: Implement the minimal API**

`app.ts` calls `connectOnce` exactly once before constructing the ready app. `main.ts` creates a `pg.Client`, runs `SELECT 1`, closes the client on all paths, starts the server only after success, prints structured events, and exits non-zero on initialization failure. The database connection timeout is bounded by `DB_CONNECT_TIMEOUT_MS`, defaulting to 2000 ms.

- [ ] **Step 4: Verify API tests GREEN**

Run: `npm test -- fixtures/startup-race/api/test/app.test.ts`

Expected: all API tests pass.

- [ ] **Step 5: Write failing worker tests**

Tests start a real local HTTP server. One returns the expected success JSON and must resolve with `work_succeeded`; another returns 503 and must reject with `api_request_failed`; a third returns malformed JSON and must reject deterministically.

- [ ] **Step 6: Verify worker tests RED**

Run: `npm test -- fixtures/startup-race/worker/test/run-worker.test.ts`

Expected: module-not-found failure for `src/run-worker.ts`.

- [ ] **Step 7: Implement the minimal worker**

`run-worker.ts` performs one abort-bounded fetch, requires HTTP 200 and `{ status: "processed" }`, emits one success or failure event, and never retries. `main.ts` reads `API_URL`, prints structured events, and maps resolution/rejection to exit code 0/1.

- [ ] **Step 8: Verify fixture service tests and type-check**

Run: `npm test -- fixtures/startup-race/api/test/app.test.ts fixtures/startup-race/worker/test/run-worker.test.ts`

Run: `npm run typecheck`

Expected: all tests pass and type-check exits 0.

- [ ] **Step 9: Commit**

```bash
git add fixtures/startup-race/api fixtures/startup-race/worker package.json package-lock.json
git commit -m "feat: add intentional startup race services"
```

### Task 3: PostgreSQL Delay Hook and Compose Fixture

**Files:**
- Create: `fixtures/startup-race/postgres/Dockerfile`
- Create: `fixtures/startup-race/postgres/delayed-entrypoint.sh`
- Create: `fixtures/startup-race/compose.yaml`
- Create: `fixtures/startup-race/.env.example`

**Interfaces:**
- Consumes: API and worker images from Task 2.
- Produces: `POSTGRES_START_DELAY_MS`, default `0`, as a fixture capability for Riya's runtime.

- [ ] **Step 1: Write a shell behavior test before the wrapper**

Add a temporary test command to the verification notes that runs the wrapper with a stubbed original entrypoint and asserts: `0` delegates immediately, `25` delegates after a fractional sleep, and `abc` exits non-zero before delegation.

- [ ] **Step 2: Verify the wrapper test RED**

Run the test command against `fixtures/startup-race/postgres/delayed-entrypoint.sh`.

Expected: file-not-found failure.

- [ ] **Step 3: Implement the wrapper and PostgreSQL image**

The POSIX shell script validates `POSTGRES_START_DELAY_MS` with a digits-only case pattern, converts milliseconds to `seconds.milliseconds`, sleeps only when non-zero, emits a structured `startup_delay_applied` event, and `exec`s `/usr/local/bin/docker-entrypoint.sh "$@"`. The Dockerfile uses `COPY --chmod=755`.

- [ ] **Step 4: Add normal Compose dependencies**

`compose.yaml` defines PostgreSQL health using `pg_isready`, starts API only after PostgreSQL is healthy, and starts worker only after API is healthy. Fixed fixture credentials are local demo values. API and worker have restart policy `no`, bounded health checks, and no external network dependency.

- [ ] **Step 5: Validate Compose configuration**

Run: `docker compose -f fixtures/startup-race/compose.yaml config`

Expected: exit code 0 and three services named `postgres`, `api`, and `worker`.

- [ ] **Step 6: Commit**

```bash
git add fixtures/startup-race
git commit -m "feat: add deterministic postgres race fixture"
```

### Task 4: HTTP and TCP Readiness Probes

**Files:**
- Create: `packages/proof/package.json`
- Create: `packages/proof/tsconfig.json`
- Create: `packages/proof/src/probes/types.ts`
- Create: `packages/proof/src/probes/http.ts`
- Create: `packages/proof/src/probes/tcp.ts`
- Create: `packages/proof/test/http.test.ts`
- Create: `packages/proof/test/tcp.test.ts`

**Interfaces:**
- Produces: `probeHttpReadiness(options): Promise<ReadinessObservation>`.
- Produces: `probeTcpReadiness(options): Promise<ReadinessObservation>`.
- `ReadinessObservation` contains `service`, `kind`, `status`, `observedAtMs`, and optional `detail`.

- [ ] **Step 1: Write failing HTTP probe tests**

Use real ephemeral HTTP servers to cover immediate ready JSON, malformed 200 JSON, connection refusal followed by success, and timeout. Expected values are literal observations; tests do not assert on mocks.

- [ ] **Step 2: Verify HTTP tests RED**

Run: `npm test -- packages/proof/test/http.test.ts`

Expected: module-not-found failure for `src/probes/http.ts`.

- [ ] **Step 3: Implement minimal bounded HTTP polling**

Use injected/default `fetch`, `Date.now`, and sleep functions. Abort each attempt within the remaining deadline. Return `ready` only for HTTP 200 plus exact `{ status: "ok" }`; continue through connection errors; return `unhealthy` for a reachable malformed terminal response; otherwise return `timeout` at the deadline.

- [ ] **Step 4: Verify HTTP tests GREEN**

Run: `npm test -- packages/proof/test/http.test.ts`

Expected: all HTTP tests pass.

- [ ] **Step 5: Write failing TCP probe tests**

Use real `net.Server` instances to cover immediate readiness, refused connection followed by readiness, and deadline timeout. Assert sockets and servers close so Vitest has no open handles.

- [ ] **Step 6: Verify TCP tests RED**

Run: `npm test -- packages/proof/test/tcp.test.ts`

Expected: module-not-found failure for `src/probes/tcp.ts`.

- [ ] **Step 7: Implement minimal bounded TCP polling**

Attempt `net.createConnection` with a per-attempt timeout capped by the remaining overall deadline. Resolve an attempt exactly once, destroy every socket, poll after errors, and return structured `ready` or `timeout` results.

- [ ] **Step 8: Verify probe suite and type-check**

Run: `npm test -- packages/proof/test/http.test.ts packages/proof/test/tcp.test.ts`

Run: `npm run typecheck`

Expected: all tests pass and type-check exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/proof package.json package-lock.json
git commit -m "feat: add bounded readiness probes"
```

### Task 5: Timeline and Deterministic Oracle

**Files:**
- Create: `packages/proof/src/oracle/types.ts`
- Create: `packages/proof/src/oracle/evaluate.ts`
- Create: `packages/proof/src/timeline.ts`
- Create: `packages/proof/src/index.ts`
- Create: `packages/proof/test/timeline.test.ts`
- Create: `packages/proof/test/oracle.test.ts`

**Interfaces:**
- Consumes: `RunResult` and `TimelineEvent` from `@dsrd/contracts`.
- Consumes: private `ObservationSnapshot` from `oracle/types.ts`.
- Produces: `evaluateRun(input: ObservationSnapshot): RunResult`.
- Produces: `ProofEvaluator` with `evaluate(input: ObservationSnapshot): RunResult`, backed by `evaluateRun`.
- Produces: `buildTimeline(input: ObservationSnapshot): TimelineEvent[]`.

- [ ] **Step 1: Write failing timeline tests**

Tests provide literal container/readiness/fixture observations and assert exact relative timestamps, zero clamping, event detail, and sorting by time then service then event.

- [ ] **Step 2: Verify timeline tests RED**

Run: `npm test -- packages/proof/test/timeline.test.ts`

Expected: module-not-found failure for `src/timeline.ts`.

- [ ] **Step 3: Implement timeline normalization**

Map container states to `container_running`, `container_exited`, or `container_missing`; readiness to `http_ready`, `http_timeout`, `http_unhealthy`, `tcp_ready`, or `tcp_timeout`; preserve structured fixture events; normalize and stable-sort all events.

- [ ] **Step 4: Verify timeline tests GREEN**

Run: `npm test -- packages/proof/test/timeline.test.ts`

Expected: all timeline tests pass.

- [ ] **Step 5: Write failing table-driven oracle tests**

Literal snapshots cover API non-zero exit, API HTTP failure, worker non-zero exit, PostgreSQL TCP failure, complete pass evidence, incomplete evidence, priority when multiple failures exist, absence of `failureReason` on pass, and unchanged logs in output.

- [ ] **Step 6: Verify oracle tests RED**

Run: `npm test -- packages/proof/test/oracle.test.ts`

Expected: module-not-found failure for `src/oracle/evaluate.ts`.

- [ ] **Step 7: Implement pure oracle rules**

Implement the six priority rules exactly as written in the design spec. The function performs no I/O, Docker calls, log-string classification, randomness, or LLM calls. It always calls `buildTimeline` and returns the shared `RunResult` shape.

- [ ] **Step 8: Verify proof package**

Run: `npm test -- packages/proof/test`

Run: `npm run typecheck`

Expected: all proof tests pass and type-check exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/proof
git commit -m "feat: add deterministic failure oracle"
```

### Task 6: Docker Reliability Verification and Documentation

**Files:**
- Create: `fixtures/startup-race/scripts/verify-normal.ps1`
- Create: `fixtures/startup-race/scripts/verify-race.ps1`
- Create: `fixtures/startup-race/README.md`
- Modify: `docs/runbooks/demo.md`

**Interfaces:**
- Consumes: fixture services and proof-layer evidence rules.
- Produces: repeatable developer verification only; no production runtime controller.

- [ ] **Step 1: Document the exact expected scenarios before scripting**

The fixture README explains normal dependency-gated startup, the explicit early-API race invocation, expected container exit codes, structured events, and cleanup commands. It states that scripts are verification helpers and Riya owns production orchestration.

- [ ] **Step 2: Add bounded normal verification**

The PowerShell script builds the fixture, starts normal Compose, waits with a fixed deadline, requires PostgreSQL and API healthy plus worker exit zero, captures logs, and cleans up in `finally`.

- [ ] **Step 3: Add bounded intentional-race verification**

The PowerShell script starts delayed PostgreSQL, starts API with `--no-deps` before readiness, waits with a fixed deadline, requires API exit code non-zero, requires `db_connection_failed` in diagnostic structured output, and cleans up in `finally`. It does not implement schedule generation or reusable runtime orchestration.

- [ ] **Step 4: Run full automated verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Run Compose validation and fixture scenarios**

Run: `docker compose -f fixtures/startup-race/compose.yaml config`

Run: `powershell -ExecutionPolicy Bypass -File fixtures/startup-race/scripts/verify-normal.ps1 -Runs 3`

Run: `powershell -ExecutionPolicy Bypass -File fixtures/startup-race/scripts/verify-race.ps1 -Runs 3`

Expected: Compose validates; all three normal runs pass; all three intended-race runs fail for the API-before-PostgreSQL-ready reason.

- [ ] **Step 6: Review ownership and contract compliance**

Run: `rg -n "search|schedule generator|minimi|docker compose" packages/proof`

Expected: no schedule/search/minimization or Docker lifecycle implementation in `packages/proof`.

- [ ] **Step 7: Commit**

```bash
git add fixtures/startup-race docs/runbooks/demo.md
git commit -m "test: verify proof layer demo reliability"
```

## Final Verification Checklist

- [ ] Every new behavior had a failing test before production implementation.
- [ ] `npm test` reports zero failures.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run build` exits 0.
- [ ] Compose configuration validates.
- [ ] Three consecutive normal fixture runs pass.
- [ ] Three consecutive intentionally perturbed fixture runs fail for the intended reason.
- [ ] `RunResult` comes from shared contracts and contains deterministic timeline evidence.
- [ ] No LLM, search engine, minimizer, or Docker orchestration policy exists in the proof package.
