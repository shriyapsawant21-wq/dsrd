# Repository Onboarding Progress

Branch: `feat/repository-onboarding`

| Task | Status | Evidence |
| --- | --- | --- |
| 1. Contracts and schemas | Complete | `55d31c5`; contracts/artifact tests and workspace typecheck |
| 2. Read-only inspection and selection | Complete | `306cd67`; discovery tests and workspace typecheck |
| 3. Pinned Git acquisition and snapshots | Complete | `81ff5be`, `6451f68`; detached revision is now frozen read-only and disposal thaws only the owned snapshot |
| 4. Isolated Compose attempts | In progress | Fresh opaque attempt IDs, pre-measurement prepare/reset, cleanup after preparation failure, `host_port_conflict` classification, external-volume preflight rejection, and a passing opt-in Docker Compose conformance test exist; explicit safe external-state configuration remains |
| 5. Confirmation, replay, artifact v3 | In progress | Three healthy baselines and matching failures are required by default; structured signatures, budget-to-`inconclusive`, ordered replay, repeated independent v3 replay, public-flow pre-publication replay gates, repository-backed v3 provenance publication, artifact serialization redaction, and invalid-provenance suppression are covered. Broader external-target publication audits remain |
| 6. Local-process adapter | In progress | `045a562`, `e04d211`, `3c8318c`; owned POSIX process trees receive TERM then KILL, timeout returns `execution_error`, process/TCP/HTTP readiness is observed, and stateful manifests require an explicit `resetCommand`. Configured reset also runs after each attempt so fixture state does not leak. |
| 7. CLI/API workflows | In progress | CLI exposes baseline/confirmation counts, explicit terminal outcomes, stable process exit codes, and delegates search to the shared discovery service. `0c34465` and `aa75ec7` guarantee one JSON terminal record for direct-search and replay setup failures; `35200c9` closes SSE for all terminal phases; `5720ce0` persists repository-search diagnostics. |
| 8. Conformance and documentation | In progress | Workspace suite passes (249 tests, 3 intentional skips), all typechecks pass, Docker-gated Compose conformance passes, and public/API/runtime redaction coverage is present. Public-repository checks and remaining outcome/publication regression coverage remain. |

Published branch commits are pushed to `origin/feat/repository-onboarding`.
Only completed, verified work is marked complete. Setup failures, budget
exhaustion, and inconsistent evidence must never publish a race artifact.

The primary worktree suite was verified through `1a713b4`. Docker `29.7.2` is
available; Compose conformance is opt-in with `DSRD_DOCKER_CONFORMANCE=1` so
ordinary unit runs do not require Docker.
