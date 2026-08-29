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
- `docs/plans/akil.md` — Akil ownership
- `docs/plans/riya.md` — Riya ownership
- `docs/plans/shriya.md` — Shriya ownership
- `docs/integration.md` — merge and integration checkpoints
- `docs/runbooks/demo.md` — golden demo definition

## Team Ownership

### Akil — Schedule Exploration Engine
Owns:
- schedule representation and candidate generation
- search loop
- minimization
- failure artifact serialization
- CLI orchestration

Does not own:
- Docker lifecycle implementation
- readiness/failure oracle implementation

### Riya — Docker Runtime
Owns:
- Compose project control
- clean reset between experiments
- controlled service startup
- delay injection
- physical replay execution
- Docker logs/metadata collection

Does not own:
- search strategy
- pass/fail semantics

### Shriya — Proof Layer
Owns:
- intentionally vulnerable demo stack
- HTTP/TCP readiness probes
- deterministic pass/fail oracle
- timeline events
- demo reliability

Does not own:
- schedule search
- Docker orchestration policy

## Replay Boundary

```text
Akil CLI reads failure.json
  -> Riya executes minimized Schedule
  -> Shriya evaluates the run
  -> Akil reports replay success/failure
```

No duplicate replay implementation across packages.

## Shared Contracts
All packages must import shared types from the contracts package. Do not create local incompatible copies of `Schedule`, `TimelineEvent`, `RunResult`, or `FailureArtifact`.

Contract changes require checking all three owners before merge.

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

## Codex / Superpowers Workflow
Before implementation:
1. read this file
2. read `docs/plan.md`
3. read the assigned owner's plan
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
