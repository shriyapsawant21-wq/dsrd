# Riya — Codex Start Prompt

```text
Use Superpowers.

Read AGENTS.md, docs/plan.md, docs/contracts/shared-contracts.md, docs/integration.md, and docs/plans/riya.md.

You own only Docker Compose execution and perturbation.

Your public responsibility is to execute a provided Schedule repeatably and return the shared RunResult shape in cooperation with the observer/oracle layer.

Do not implement schedule search or decide search strategy.

First produce an implementation plan. Then build:
stack lifecycle -> clean reset -> service start delays -> readiness-delay mechanism where needed -> logs/metadata -> execution from provided schedule -> replay execution.

Prioritize repeatability and cleanup over abstractions.
```
