# Runtime–Proof Integration Design

## Goal

Connect Riya's runtime execution to Shriya's deterministic proof layer so a runtime `ObservationSnapshot` becomes the shared `RunResult` consumed by Akil's scheduler and minimizer.

## Ownership Boundary

- Akil owns schedules, search, minimization, and replay artifacts.
- Riya owns Compose lifecycle, service startup, delay injection, and collection of service state and logs.
- Shriya owns probes, evidence interpretation, deterministic pass/fail decisions, timeline construction, and the vulnerable demo stack.

The proof package will implement Riya's `RunObserver` interface. It will not start containers, inject delays, or choose schedules.

## Data Flow

```text
Schedule
  -> DockerRuntimeController
  -> ObservationSnapshot { scheduleId, services, logs }
  -> RuntimeProofObserver
       -> translate container state
       -> run HTTP/TCP probes
       -> parse structured and recognized failure logs
       -> deterministic oracle
       -> timeline
  -> RunResult
```

## Runtime Observer Adapter

`RuntimeProofObserver` will live in `packages/proof` and implement the runtime package's `RunObserver` interface. Configuration will identify the API HTTP endpoint and PostgreSQL TCP endpoint. Probe functions and the clock will be injectable so integration-style tests do not require Docker or real sockets.

Runtime service state is translated into the proof layer's internal `ContainerObservation`. The adapter runs independent probes concurrently, parses logs, builds the richer internal observation, and delegates the final decision to the proof oracle.

## Deterministic Failure Detection

The log parser will recognize:

- structured fixture JSON events such as database connection failures and API request failures;
- connection-refused markers such as `ECONNREFUSED` and `connection refused`;
- timeout markers such as `ETIMEDOUT`, `timed out`, and `timeout`;
- dependency-readiness markers such as `dependency not ready` and startup failures.

Rules are fixed string/pattern matches, never LLM classification. Structured evidence is preferred. Raw matching lines are preserved in `RunResult.logs` and summarized in the failure reason when machine state or probes show a failure.

A complete, machine-proven successful run is not changed to failure by an unrelated or historical scary log line. This prevents false failures from stale logs.

## Timeline Semantics

Probe timestamps use an injectable wall clock and are converted to offsets suitable for rendering. Runtime logs currently arrive without Docker timestamps, so parsed log events retain stable observed order. They will not claim false event-time precision.

The timeline includes:

- readiness attempts and outcomes;
- first database connection attempt when emitted by the fixture;
- dependency or request failures;
- relevant container metadata and exit outcomes.

## Four-Service Demo

The demo stack becomes:

```text
PostgreSQL -> API -> Worker
Redis --------^ 
```

Redis is the fourth service because it represents a scalable backend dependency without adding prohibited UI work. The API verifies Redis readiness as part of startup. Normal Compose startup waits for healthy PostgreSQL and Redis. The hidden failure remains a single intentional PostgreSQL process-startup race exposed only when Riya's runtime executes the vulnerable schedule or introduces the matching startup delay.

Redis must not create a second race. The replay example will contain all four service starts and the PostgreSQL timing perturbation.

## Contracts

No shared-contract change is required. The adapter returns the existing `RunResult` from `@dsrd/contracts`. Parser-specific evidence remains internal to `@dsrd/proof`.

## Verification

- unit tests for log classification and structured-event parsing;
- existing HTTP/TCP probe tests;
- integration-style observer tests with injected probes and runtime snapshots;
- fixture tests and Compose validation;
- normal and intentional-race reliability scripts;
- repository `npm test`, `npm run build`, and `npm run typecheck`.
