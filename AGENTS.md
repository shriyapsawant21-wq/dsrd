# Distributed Startup Race Debugger

## Mission
Build a dynamic debugger for startup-order and readiness race conditions in Docker Compose applications.

The system must actively perturb startup timing, observe execution, detect failures, minimize failing schedules, and replay them.

## Non-Goals
Do not reduce the project to:
- AI log summarization
- static Docker Compose linting
- dependency graph visualization only
- an LLM wrapper around container logs

LLMs may explain evidence, but must not decide whether a failure occurred.

## Core Pipeline

```text
docker-compose.yml
  -> Compose / Service Model
  -> Schedule Generator
  -> Startup Perturbation
  -> Docker Runtime Controller
  -> Runtime Event Collector
  -> Failure Oracle
  -> Failing Schedule
  -> Schedule Minimizer
  -> Replay Artifact
  -> Deterministic Replay
  -> Timeline UI
```

The discover -> minimize -> replay architecture is fixed for the hackathon MVP.

## Shared Source of Truth
Read these before implementation:
- `docs/plan.md` — overall architecture and team integration
- `docs/contracts/shared-contracts.md` — cross-team interfaces
- `docs/plans/akil.md` — schedule exploration component plan
- `docs/plans/riya.md` — Docker runtime component plan
- `docs/plans/shriya.md` — proof-layer component plan
- `docs/integration.md` — merge and integration checkpoints
- `docs/runbooks/demo.md` — golden demo definition

## Package Boundaries

Any contributor may work anywhere in the repository. Keep changes coherent with
these component boundaries, but do not treat them as exclusive ownership:

- Scheduler: schedule representation, candidate generation, search,
  minimization, artifacts, and CLI orchestration.
- Runtime: platform lifecycle, preflight, controlled startup, delay injection,
  replay execution, and runtime metadata collection.
- Proof: fixture behavior, readiness probes, deterministic oracle, and timeline
  evidence.

## Replay Boundary

```text
CLI reads failure.json
  -> runtime executes minimized Schedule
  -> proof evaluates the run
  -> CLI reports replay success/failure
```

No duplicate replay implementation across packages.

## Shared Contracts
All packages must import shared types from the contracts package. Do not create local incompatible copies of `Schedule`, `TimelineEvent`, `RunResult`, or `FailureArtifact`.

Contract changes require checking every package consumer before merge.

## Definition of Done
A race is only considered discovered when:
1. normal startup succeeds
2. an explored schedule causes a real failure
3. failure is detected automatically
4. the triggering schedule is saved
5. unnecessary perturbations are minimized
6. replay reproduces the expected failure
7. timeline evidence explains the ordering

If replay fails to reproduce the failure, the feature is not done.

## Engineering Rules
- Prefer deterministic behavior over LLM judgment.
- Write tests for deterministic components.
- Never claim something works without running the relevant test/demo.
- Keep modules narrow and interfaces explicit.
- Prefer the smallest working primitive over a sophisticated abstraction.
- Do not add auth, billing, cloud deployment, accounts, or unrelated platform work before the core debugger works.

## Reliability and Evidence Rules
- A Docker image pull, image build, missing environment file, invalid Compose file,
  port conflict, command failure, timeout, or cleanup failure is an execution/setup
  error, not a race failure.
- Preflight Compose targets before measuring a schedule. Image acquisition and build
  time must not consume the experiment's startup/readiness timeout.
- A baseline must be demonstrably healthy before exploration begins. If it is not,
  return an explicit `target_unhealthy`, `execution_error`, or `inconclusive` result;
  do not save a race artifact.
- Confirm both a normal baseline and a candidate failure across configurable repeated
  runs. Alternating outcomes are flaky/inconclusive until the configured threshold
  is met.
- Strong evidence is required for a race: non-zero terminal exit, failed health or
  readiness probe, explicit structured application failure event, or an expected
  terminal job failure. Generic log strings such as `timeout` or `ECONNREFUSED` are
  diagnostic timeline evidence only and must never be the sole failure oracle.
- A replay succeeds only when the same minimized schedule reproduces the expected
  failure category and meaningful ordering evidence through the same runtime and
  oracle path used for discovery.
- Make run, readiness, and preflight timeouts configurable. Never silently map a
  timeout to pass, no-failure, or discovered-race status.

## External Target Rules
- Treat third-party Compose repositories as untrusted test inputs. Do not modify
  their tracked source to make a race appear; use only documented local setup files
  and report setup failures separately.
- Inspect a target's setup requirements, health checks, terminal jobs, and readiness
  signals before claiming it is suitable for DSRD.
- Always clean only the exact target Compose project after an experiment. Report
  containers, networks, and volumes removed; never run broad Docker cleanup commands.

## Test Isolation
- Vitest and other test runners must exclude `.worktrees/`, nested clones,
  `node_modules/`, build output, and other non-primary checkouts. Test counts must
  describe this checkout only.
- The golden Compose demo is complete only after fresh preflight, baseline,
  discovery, minimization, artifact creation, and replay verification all pass.

## Codex / Superpowers Workflow
Before implementation:
1. read this file
2. read `docs/plan.md`
3. read the relevant component plans
4. use Superpowers planning before coding

For independent tasks, subagents may be used, but they must not redesign cross-team interfaces.

Use verification-before-completion before declaring milestones complete.

## Git Rules
- Work on separate feature branches.
- Make small logical commits.
- Merge shared contracts before dependent work.
- Pull/rebase shared changes before integration.
- Avoid destructive Git operations.
- Do not wait until Day 3 to integrate.
