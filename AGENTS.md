# Distributed Startup Race Debugger

## Mission

Build a debugger for startup-order and readiness race conditions in
containerized distributed applications.

The tool must actively manipulate startup timing, observe the resulting
execution, detect failures, minimize failing schedules, and reproduce them.

## Core Principle

This is a dynamic debugger.

Do NOT reduce the project to:

- AI log summarization
- log classification
- Docker Compose linting
- dependency graph visualization
- static configuration analysis
- an LLM wrapper around container logs

AI may explain a discovered failure, but it must not be responsible for
deciding whether the race actually occurred.

## Required Core Pipeline

docker-compose.yml
    ↓
Compose / Service Model
    ↓
Schedule Generator
    ↓
Startup Perturbation
    ↓
Docker Runtime Controller
    ↓
Runtime Event Collector
    ↓
Failure Oracle
    ↓
Failing Schedule
    ↓
Schedule Minimizer
    ↓
Replay Artifact
    ↓
Deterministic Replay
    ↓
Timeline / Explanation UI

The implementation details may change.

The fundamental discover → minimize → replay architecture must remain.

## Primary Hackathon Goal

Build the smallest convincing end-to-end implementation first.

The golden demo should demonstrate:

1. A distributed application normally starts successfully.
2. The debugger explores a different startup timing.
3. The altered timing exposes a real startup race.
4. The failure is detected automatically.
5. The debugger records the triggering schedule.
6. The schedule is minimized.
7. The minimized schedule is saved.
8. Replay reproduces the same failure.
9. A timeline explains what happened.

## Golden Fixture

The first fixture should be intentionally vulnerable.

Example:

Database
    ↓
API

The API assumes the database is ready immediately and performs an initial
connection without sufficient retry/readiness handling.

Normal execution:

database starts
→ database becomes ready
→ API starts
→ connection succeeds

Race execution:

database starts
→ API starts too early
→ API connects
→ database is not ready
→ startup failure

The debugger should discover the problematic timing rather than being told
exactly which delay produces it.

## Failure Oracle

Prefer machine-verifiable signals.

Possible signals:

- non-zero process exit
- Docker health status
- container restart
- TCP connection failure
- HTTP readiness failure
- dependency connection refusal
- startup timeout
- expected service unavailable
- explicit fixture invariant violation

Do not rely solely on LLM interpretation.

## Replay

Every discovered bug must produce a reproducible artifact.

Conceptually:

race-debugger replay failing-schedule.json

Replay must recreate the relevant timing perturbation and verify that the
expected failure occurs.

If replay does not reproduce the failure, the bug is not considered
successfully discovered.

## Minimization

Once a failing schedule is discovered, eliminate unnecessary perturbations.

The final result should contain the smallest practical set of timing changes
required to reproduce the bug.

Prefer deterministic algorithms such as delta debugging or equivalent
reduction strategies.

## Development Priorities

In order:

1. Golden vulnerable fixture
2. Docker runtime control
3. Startup perturbation
4. Runtime observation
5. Failure oracle
6. Failing schedule serialization
7. Replay
8. Schedule minimization
9. Timeline visualization
10. Multiple race patterns
11. UX and polish

Do not prioritize authentication, billing, cloud deployment, user management,
marketing pages, or unrelated platform infrastructure.

## Engineering Rules

Use tests for important deterministic components.

Before claiming something works:

- run the relevant tests
- run the golden fixture
- confirm the actual output
- verify replay where applicable

Do not claim successful execution without evidence.

## Agent Delegation

Use parallel agents only for genuinely independent tasks.

Good parallel investigation areas include:

- Docker / Compose runtime control
- schedule exploration algorithms
- failure oracle design
- schedule minimization
- timeline visualization
- adversarial fixture design

The primary agent owns architectural integration.

Subagents should not independently redesign the overall product.

## Git

Make small logical commits.

Do not perform destructive Git operations unless explicitly necessary.

Use worktrees when multiple implementation agents need to modify independent
parts of the project simultaneously.

## Hackathon Constraint

Prefer:

working primitive > sophisticated abstraction

deterministic behavior > AI inference

visible technical depth > unnecessary feature count

reproducible demo > broad unsupported claims
