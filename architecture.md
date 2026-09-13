# DSRD Architecture

DSRD is a dynamic debugger for startup-order and readiness races. It does not
declare a race from log text: it perturbs timing, runs the target, evaluates
deterministic evidence, minimizes a confirmed schedule, and independently
replays it.

```text
repository input → discovery/configuration → prepared target
→ fresh owned attempt → oracle → confirmation/minimization
→ ordered replay → portable failure artifact
```

## Boundaries

`@dsrd/contracts` owns all public DTOs and Zod schemas. `@dsrd/discovery`
handles acquisition, bounded read-only inspection, configuration, target
selection, and source identity. Runtime adapters own Docker, processes, and
Kubernetes lifecycle operations. Scheduler owns bounded search and
minimization; proof owns deterministic observations and failure classification.
CLI and HTTP API are thin clients of the same onboarding/discovery/replay
orchestration; neither independently implements replay semantics.

Existing v2 schedules, timeline events, run results, and artifacts remain
compatible. New evidence fields are optional until all producers migrate. A v2
artifact is legacy evidence, not a verified v3 replay artifact.

## Lifecycle and safety

Inspection never runs package scripts. Git inputs are pinned to a detached
revision; public metadata never includes embedded credentials. Each execution
attempt must have separately owned resources and exact cleanup. Preparation,
builds, pulls, and reset happen before the measured startup deadline.

The staged architecture and acceptance requirements are in
[the scalable debugger architecture](docs/superpowers/specs/2026-09-12-scalable-debugger-architecture.md).
