# Proof Layer Design

## Purpose

Build a deterministic proof layer for the Distributed Startup Race Debugger. The proof layer supplies a real three-service Docker Compose fixture, observes readiness and startup outcomes, classifies each run without an LLM, and returns shared `RunResult` data with an explanatory timeline.

The proof layer does not generate schedules, choose perturbations, control the Docker lifecycle, minimize failures, serialize replay artifacts, or implement replay policy.

## Scope

The implementation includes:

- a `postgres -> api -> worker` demonstration fixture;
- a deterministic PostgreSQL process-start delay hook whose default is zero;
- an API that makes one startup-time PostgreSQL connection attempt without retrying;
- a worker that makes one startup-time API request;
- HTTP and TCP readiness probes;
- a deterministic failure oracle;
- ordered timeline event construction;
- a narrow proof-layer API that returns the shared `RunResult` type;
- unit, integration, and Docker fixture reliability tests.

The frontend is explicitly deferred.

## Architectural Boundaries

Akil owns schedule generation, search, minimization, CLI orchestration, and failure artifact serialization. Riya owns Docker Compose lifecycle, clean reset, service start timing, delay injection policy, log and metadata collection, and physical replay. Shriya's proof layer owns the fixture and the conversion of runtime observations into pass/fail evidence.

The proof layer imports `Schedule`, `TimelineEvent`, and `RunResult` from `packages/contracts`. It does not define competing copies of shared contracts. Its internal observation types remain private to `packages/proof` unless all owners later approve a contract change.

The runtime-facing boundary is:

```ts
export type ProofEvaluator = {
  evaluate(input: ObservationSnapshot): RunResult;
};
```

Riya's runtime constructs `ObservationSnapshot` from container state, probe results, logs, and captured fixture events. The evaluator performs no Docker commands.

## Fixture Architecture

### PostgreSQL

The fixture uses the official PostgreSQL image and a small wrapper entrypoint. The wrapper reads `POSTGRES_START_DELAY_MS`, validates it as a non-negative integer, sleeps for that duration, and then delegates to the original PostgreSQL entrypoint with `exec`.

The default delay is `0`, so normal startup is not artificially slowed. The wrapper is a deterministic fixture capability; Riya decides whether and how a schedule sets the environment variable.

PostgreSQL has a Compose health check using `pg_isready`.

### API

The API is a Node.js Express service using `pg`. On startup it performs exactly one PostgreSQL query (`SELECT 1`). It intentionally has no retry loop.

If the query succeeds, the API starts its HTTP server. `GET /health` returns HTTP 200 with `{ "status": "ok" }`. A simple application endpoint returns a deterministic response for the worker.

If the initial database connection fails, the API emits a structured JSON event describing `db_connection_failed`, sets a non-zero process exit code, and exits. The structured event supports diagnosis, but the oracle's primary evidence is the observed non-zero container exit and readiness outcome.

### Worker

The worker makes one request to the API application endpoint. A successful response emits a structured `work_succeeded` event and exits zero. Connection failure, timeout, non-2xx response, or malformed response emits `api_request_failed` and exits non-zero.

The worker does not retry. This preserves the intended startup assumption and keeps each run bounded.

### Normal and Failing Conditions

Normal Compose startup waits for PostgreSQL health before starting the API and waits for API health before starting the worker. It must pass repeatedly with `POSTGRES_START_DELAY_MS=0`.

A perturbed run may start the API while delayed PostgreSQL is not accepting TCP connections. In that condition, the API's only database attempt fails and the API exits non-zero. The runtime remains responsible for bypassing or controlling normal dependency startup when executing a schedule.

The fixture must not fail because of random sleeps, random numbers, external network calls, or an LLM decision.

## Readiness Probes

### HTTP Probe

The HTTP probe accepts a URL, timeout, polling interval, clock, and fetch implementation. It polls until one of these deterministic outcomes occurs:

- `ready`: HTTP 200 with JSON body `{ "status": "ok" }`;
- `unhealthy`: a reachable endpoint returns a terminal malformed/unexpected response when configured as a single check;
- `timeout`: readiness was not observed before the deadline.

Each attempt records a timestamped observation. Abort signals bound individual requests so a hung connection cannot hang the run.

### TCP Probe

The TCP probe accepts host, port, timeout, polling interval, clock, and connector. It polls until a TCP connection succeeds or the deadline expires. Sockets are always destroyed after success, error, or timeout.

TCP success means only that the port accepts connections. It does not claim PostgreSQL query readiness; the API's actual `SELECT 1` supplies that stronger application evidence.

## Observation Model

`ObservationSnapshot` contains only data already observed by the runtime and probes:

```ts
type ObservationSnapshot = {
  scheduleId: string;
  startedAtMs: number;
  containers: Array<{
    service: string;
    state: "running" | "exited" | "missing";
    exitCode?: number;
    observedAtMs: number;
  }>;
  readiness: Array<{
    service: string;
    kind: "http" | "tcp";
    status: "ready" | "timeout" | "unhealthy";
    observedAtMs: number;
    detail?: string;
  }>;
  fixtureEvents: TimelineEvent[];
  logs: string[];
};
```

`observedAtMs` values are absolute clock readings. Timeline construction converts them to non-negative milliseconds relative to `startedAtMs`.

## Deterministic Oracle

The oracle evaluates fixed rules in priority order so identical observations always produce identical results:

1. If the API exited with a non-zero code, return `fail` with reason `API exited during startup before becoming ready`.
2. If API HTTP readiness is `timeout` or `unhealthy`, return `fail` with reason `API did not become ready before the startup deadline`.
3. If the worker exited with a non-zero code, return `fail` with reason `Worker could not complete its startup API request`.
4. If PostgreSQL TCP readiness is not `ready`, return `fail` with reason `PostgreSQL did not become ready before the startup deadline`.
5. If API HTTP readiness and PostgreSQL TCP readiness are both `ready`, the API is running, and the worker exited zero, return `pass`.
6. Any incomplete or contradictory snapshot returns `fail` with reason `Run ended without complete pass evidence`.

Known log strings may enrich timeline details but never independently flip `status` from pass to fail. No LLM participates in evaluation.

The resulting `RunResult` always contains `scheduleId`, `status`, ordered `events`, and `logs`. `failureReason` is present only for failures.

## Timeline

Timeline construction combines:

- container state observations;
- HTTP and TCP readiness outcomes;
- structured fixture events emitted by the API and worker.

Events use the shared `TimelineEvent` shape. They are sorted by `timeMs`, then service name, then event name to guarantee stable output when timestamps are equal. Negative offsets are clamped to zero. Logs remain in `RunResult.logs`; arbitrary unstructured log lines are not converted into authoritative events.

Representative failure timeline:

```text
0ms     postgres container running
20ms    api container running
420ms   api db_connection_failed (ECONNREFUSED)
430ms   api container exited (code 1)
1800ms  postgres tcp_ready
```

## Files and Responsibilities

- Root `package.json`, workspace configuration, and `tsconfig.json`: TypeScript build and test entry points.
- `packages/contracts`: exact shared contract implementation from `docs/contracts/shared-contracts.md` if it is still absent when coding begins.
- `fixtures/startup-race/compose.yaml`: normal healthy dependency chain and service configuration.
- `fixtures/startup-race/postgres/delayed-entrypoint.sh`: validated process startup delay followed by the official entrypoint.
- `fixtures/startup-race/api`: API service, health endpoint, one-shot database connection, structured events, Dockerfile, and tests.
- `fixtures/startup-race/worker`: one-shot API consumer, structured events, Dockerfile, and tests.
- `packages/proof/src/probes/http.ts`: bounded HTTP readiness polling.
- `packages/proof/src/probes/tcp.ts`: bounded TCP readiness polling.
- `packages/proof/src/oracle/types.ts`: private observation types.
- `packages/proof/src/oracle/evaluate.ts`: deterministic pass/fail rules and `RunResult` creation.
- `packages/proof/src/timeline.ts`: normalization and stable ordering of events.
- `packages/proof/src/index.ts`: narrow public exports for runtime integration.
- `packages/proof/test`: unit and local integration tests.

## Error Handling

- Invalid PostgreSQL delay values cause the wrapper to print a clear error and exit non-zero rather than silently choose a timing.
- Probe timeouts are explicit results, not thrown control flow.
- Invalid HTTP payloads are recorded as unhealthy observations.
- Socket and fetch resources are closed or aborted on every terminal path.
- Oracle input is checked for missing or contradictory evidence and fails closed with a deterministic reason.
- Fixture services use bounded connection/request timeouts so demo runs cannot hang indefinitely.

## Testing Strategy

Implementation follows test-driven development.

Unit tests cover:

- HTTP ready, malformed response, connection error followed by success, and deadline timeout;
- TCP ready, connection error followed by success, and deadline timeout;
- every oracle priority rule, the complete pass condition, incomplete evidence, and stable failure reasons;
- timeline offset normalization and deterministic ordering.

Service tests cover:

- API health only after a successful real database initialization boundary;
- API non-zero failure after one unsuccessful database attempt with no retry;
- worker zero/non-zero outcomes for successful and failed API responses.

Docker fixture verification covers:

- normal startup passes repeatedly;
- a known delayed-PostgreSQL/start-API-early execution fails for the intended reason;
- repeated failing runs produce the same oracle reason and equivalent event ordering;
- cleanup leaves no stale fixture state.

Docker lifecycle commands used by verification scripts are test support only. Production orchestration remains Riya's responsibility.

## Acceptance Criteria

The proof layer is complete when fresh verification demonstrates:

1. the three-service fixture starts normally and passes;
2. delaying PostgreSQL and starting the API before readiness produces the intentional one-shot connection failure;
3. HTTP and TCP probes return bounded structured observations;
4. the oracle classifies pass/fail entirely from deterministic evidence;
5. the returned value conforms to the shared `RunResult` contract;
6. timeline events explain that the API attempted PostgreSQL before PostgreSQL became ready;
7. normal and intended failing scenarios repeat reliably;
8. no schedule search or Docker orchestration policy exists in the proof package.
