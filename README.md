# DSRD — Distributed Startup Race Debugger

A local chaos-style debugger for Docker Compose applications that actively explores startup timing to discover, minimize, and replay hidden startup race conditions.

## Core Idea

```text
normal Compose app
      -> perturb startup timing
      -> execute repeatedly
      -> detect a failing schedule
      -> minimize it
      -> save failure.json
      -> replay the same failure
      -> show a timeline
```

This is a dynamic debugger, not an AI log summarizer or static Compose linter.

## Team
- Akil — schedule exploration, minimization, CLI
- Riya — Docker Compose runtime and delay injection
- Shriya — observability, failure oracle, demo fixture

## Documentation
- [`AGENTS.md`](AGENTS.md) — shared Codex/project rules
- [`docs/plan.md`](docs/plan.md) — overall architecture and hackathon plan
- [`docs/contracts/shared-contracts.md`](docs/contracts/shared-contracts.md) — shared interfaces
- [`docs/integration.md`](docs/integration.md) — team integration workflow
- [`docs/plans/akil.md`](docs/plans/akil.md) — Akil plan
- [`docs/plans/riya.md`](docs/plans/riya.md) — Riya plan
- [`docs/plans/shriya.md`](docs/plans/shriya.md) — Shriya plan
- [`docs/runbooks/demo.md`](docs/runbooks/demo.md) — golden demo runbook
- [`docs/prompts/`](docs/prompts/) — Codex start prompts per teammate

## Target CLI

```bash
race-debugger search
race-debugger replay failure.json
race-debugger inspect docker-compose.yml
```

## MVP Definition of Done
A bug is only considered discovered when a normally working fixture fails under an explored schedule, the failure is automatically detected, the schedule is minimized, and replay reproduces the same expected failure.
