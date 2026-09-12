# Repository Onboarding Progress

Branch: `feat/repository-onboarding`

| Task | Status | Evidence |
| --- | --- | --- |
| 1. Contracts and schemas | Complete | `55d31c5`; contracts/artifact tests and workspace typecheck |
| 2. Read-only inspection and selection | Complete | `306cd67`; discovery tests and workspace typecheck |
| 3. Pinned Git acquisition and snapshots | Complete | `81ff5be`, `6451f68`; detached revision is now frozen read-only and disposal thaws only the owned snapshot |
| 4. Isolated Compose attempts | In progress | Fresh opaque attempt IDs and pre-measurement prepare/reset exist; explicit host-port and external-volume classification plus Docker conformance remain |
| 5. Confirmation, replay, artifact v3 | In progress | Candidate schedules and physical attempts are now reported separately; repeated-signature confirmation, ordered independent replay, and v3 publication gating remain |
| 6. Local-process adapter | In progress | `045a562`, `e04d211`; owned POSIX process trees receive TERM then KILL and timeout returns `execution_error`; readiness probes, reset-policy configuration, and cleanup reporting remain |
| 7. CLI/API workflows | Pending | Shared inspect/init/prepare/search/replay service flow and stable JSON/exit-code contract remain |
| 8. Conformance and documentation | In progress | Workspace suite/typecheck pass; Docker-gated Compose conformance, public-repository checks, and outcome/publication regression coverage remain |

Published branch commits are pushed to `origin/feat/repository-onboarding`.
Only completed, verified work is marked complete. Setup failures, budget
exhaustion, and inconsistent evidence must never publish a race artifact.

The primary worktree suite was last verified after the commits above. Docker
`29.7.2` is available in this environment, so Compose conformance must run as a
real test once that suite is added; it is not a missing-Docker skip.
