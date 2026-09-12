# Repository Onboarding Progress

Branch: `feat/repository-onboarding`

| Task | Status | Evidence |
| --- | --- | --- |
| 1. Contracts and schemas | Complete | `55d31c5`; contracts/artifact tests and workspace typecheck |
| 2. Read-only inspection and selection | Complete | `306cd67`; discovery tests and workspace typecheck |
| 3. Pinned Git acquisition and snapshots | Complete | `81ff5be`, `6451f68`; detached revision is now frozen read-only and disposal thaws only the owned snapshot |
| 4. Isolated Compose attempts | In progress | Fresh opaque attempt IDs, pre-measurement prepare/reset, cleanup after preparation failure, `host_port_conflict` classification, and an opt-in Docker Compose conformance test exist; external-volume policy remains |
| 5. Confirmation, replay, artifact v3 | In progress | Three healthy baselines and matching failures are required by default; structured signatures, budget-to-`inconclusive`, ordered replay, public-flow pre-publication replay gates, and validated opt-in v3 artifact publication exist. End-to-end onboarding provenance wiring and repeated independent replay remain |
| 6. Local-process adapter | In progress | `045a562`, `e04d211`; owned POSIX process trees receive TERM then KILL, timeout returns `execution_error`, process/TCP/HTTP readiness is observed, and stateful manifests require an explicit `resetCommand`; cleanup reporting remains |
| 7. CLI/API workflows | In progress | CLI exposes baseline/confirmation counts and explicit terminal outcomes; API now preserves explicit orchestration outcomes, and CLI/API use the shared replay gate. Stable JSON/exit codes and end-to-end onboarding commands remain |
| 8. Conformance and documentation | In progress | Workspace suite/typecheck pass; an opt-in Docker-gated Compose conformance test is present. Public-repository checks and remaining outcome/publication regression coverage remain |

Published branch commits are pushed to `origin/feat/repository-onboarding`.
Only completed, verified work is marked complete. Setup failures, budget
exhaustion, and inconsistent evidence must never publish a race artifact.

The primary worktree suite was verified through `61cd47c`. Docker `29.7.2` is
available; Compose conformance is opt-in with `DSRD_DOCKER_CONFORMANCE=1` so
ordinary unit runs do not require Docker.
