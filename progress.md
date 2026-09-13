# Repository Onboarding Progress

Branch: `feat/repository-onboarding`

| Task | Status | Evidence |
| --- | --- | --- |
| 1. Contracts and schemas | Complete | `55d31c5`; contracts/artifact tests and workspace typecheck |
| 2. Read-only inspection and selection | Complete | `306cd67`; discovery tests and workspace typecheck |
| 3. Pinned Git acquisition and snapshots | Complete | `81ff5be`, `6451f68`; detached revision is now frozen read-only and disposal thaws only the owned snapshot |
| 4. Isolated Compose attempts | Complete | Fresh opaque attempt IDs, pre-measurement prepare/reset, cleanup after preparation failure, `host_port_conflict` classification, external-volume preflight rejection, and Docker-gated conformance are verified. External mutable volumes remain explicitly rejected. |
| 5. Confirmation, replay, artifact v3 | Complete | Three healthy baselines and matching failures are required by default; structured signatures, budget-to-`inconclusive`, ordered replay, repeated independent v3 replay, public-flow pre-publication replay gates, repository-backed provenance, artifact redaction, invalid-provenance suppression, and candidate-level terminal-status preservation (`2dbcdbb`) are covered. |
| 6. Local-process adapter | Complete | `045a562`, `e04d211`, `3c8318c`; owned POSIX process trees receive TERM then KILL, timeout returns `execution_error`, process/TCP/HTTP readiness is observed, and stateful manifests require an explicit `resetCommand`. Configured reset also runs after each attempt so fixture state does not leak. |
| 7. CLI/API workflows | Complete | CLI exposes baseline/confirmation counts, explicit terminal outcomes, stable process exit codes, and shared orchestration. `0c34465` and `aa75ec7` guarantee one JSON terminal record for direct-search and replay setup failures; `429239a` normalizes unexpected repository-search results to the closing `error` SSE phase; `5720ce0` persists repository-search diagnostics. |
| 8. Conformance and documentation | Complete | Workspace tests, typechecks, Docker-gated Compose conformance, public local-fixture inspection/pinned-Git coverage, API/runtime redaction coverage, and documentation are complete. Kind-gated Kubernetes conformance remains an explicitly documented environment prerequisite. |

Published branch commits are pushed to `origin/feat/repository-onboarding`.
Only completed, verified work is marked complete. Setup failures, budget
exhaustion, and inconsistent evidence must never publish a race artifact.

The primary worktree suite was verified through `1a713b4`. Docker `29.7.2` is
available; Compose conformance is opt-in with `DSRD_DOCKER_CONFORMANCE=1` so
ordinary unit runs do not require Docker.
