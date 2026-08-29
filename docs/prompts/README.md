# Prompt Timeline

Use these prompts in order after Shriya's first observability/demo-stack work is available.

## Phase 1 - Individual Post-Work

These can happen mostly in parallel, but Riya and Shriya should sync on the oracle observation shape before either side locks it in.

1. `docs/prompts/shriya/01-oracle-contract.md`
2. `docs/prompts/riya/01-oracle-integration.md`
3. `docs/prompts/shriya/02-failure-timeline.md`
4. `docs/prompts/riya/02-demo-repeatability.md`
5. `docs/prompts/akil/01-real-runner.md`
6. `docs/prompts/shriya/03-demo-reliability.md`
7. `docs/prompts/riya/03-runtime-smoke-proof.md`
8. `docs/prompts/akil/02-real-search.md`
9. `docs/prompts/akil/03-artifact-replay-minimize.md`

## Phase 2 - Final Team Integration

Run these after the individual post-work branches are merged into `dev`.

1. `docs/prompts/team/01-gate-2-real-run.md`
2. `docs/prompts/team/02-search-artifact-replay.md`
3. `docs/prompts/team/03-minimize-ui-demo.md`

## Ownership Rule

- Akil owns schedule search, minimization, artifact writing, replay command orchestration, and CLI flow.
- Riya owns Docker Compose execution, perturbation, reset, cleanup, logs, metadata, and physical replay execution.
- Shriya owns demo stack, probes, deterministic oracle, pass/fail evidence, timeline events, and demo reliability.

No one should duplicate another owner's implementation. Shared contract changes must update `docs/contracts/shared-contracts.md` and `packages/contracts/src/index.ts`.
