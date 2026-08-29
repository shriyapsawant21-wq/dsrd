# Shriya — Codex Start Prompt

```text
Use Superpowers.

Read AGENTS.md, docs/plan.md, docs/contracts/shared-contracts.md, docs/integration.md, and docs/plans/shriya.md.

You own the proof layer: demo fixture, readiness probes, deterministic failure oracle, timeline events, and demo reliability.

Do not implement schedule search or Docker orchestration policy.

First produce an implementation plan. Then build:
fixture -> intentional race -> HTTP/TCP readiness probes -> deterministic pass/fail oracle -> timeline events -> reliable RunResult output.

Do not use an LLM to classify pass/fail.

The fixture must normally pass and fail only under the intended startup timing conditions.
```
