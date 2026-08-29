# Akil — Codex Start Prompt

```text
Use Superpowers.

Read AGENTS.md, docs/plan.md, docs/contracts/shared-contracts.md, docs/integration.md, and docs/plans/akil.md.

You own only the schedule exploration engine, minimization, failure artifact, and CLI orchestration.

Do not implement Docker lifecycle or the failure oracle.

Build against the shared contracts. Use a fake runSchedule() until the real runtime is available.

First produce an implementation plan. Then implement incrementally:
Schedule schema usage -> candidate generation -> search loop -> failure selection -> minimization -> failure artifact -> CLI orchestration.

The search package must remain testable without Docker.

Do not claim completion until tests and the integration contract are verified.
```
