# Riya Prompt - Post-Work Integration

Use this after Shriya's `feat/observability` work is pushed or merged and the team is ready for Riya's next integration work.

```text
Use Superpowers.

You are working on DSRD after Shriya's observability/demo-stack work is available.

Start from the latest dev:

git switch dev
git pull team dev
git switch -c feat/runtime-observer-integration

Read:
- AGENTS.md
- docs/plan.md
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/riya.md
- packages/contracts/src/index.ts
- packages/runtime/src/runtime-controller.ts
- Shriya's observability package/source files
- Shriya's demo compose files

Your ownership remains Docker Compose execution and perturbation.

Do not implement search strategy, minimization strategy, or pass/fail oracle policy.

Build the Gate 2 runtime integration:

1. Connect runtime observations to Shriya's oracle.
   - Runtime should execute a provided `Schedule`.
   - Runtime should collect container metadata, logs, start timing, and cleanup state.
   - Pass the observation data to Shriya's oracle/observer adapter.
   - Return the shared `RunResult` shape.

2. Make demo-stack execution repeatable.
   - Support the demo compose file path/project name expected by Shriya's stack.
   - Clean reset before each experiment.
   - Cleanup after success, failure, timeout, and thrown errors.
   - Preserve logs/metadata even when the app fails.

3. Validate delay behavior against the real demo stack.
   - A normal no-delay schedule should pass.
   - A known bad schedule from Shriya's fixture should fail.
   - Replay should call the same execution path as `runSchedule`.

4. Add runtime-level integration tests or scripts.
   - Keep Docker-free unit tests for command ordering and cleanup.
   - Add a Docker smoke command that can be skipped when Docker is unavailable.
   - Document the exact manual command that proves runtime works on your machine.

Definition of done:
- `runSchedule(schedule)` works with Shriya's demo stack.
- `replaySchedule(schedule)` uses the same execution/oracle path.
- Runtime never decides pass/fail by itself.
- Runtime cleanup is reliable across repeated runs.

Verify before finishing:

npm test
npm run build
npm run typecheck

If Docker Desktop is available, run:
- one normal demo schedule that passes
- one known failing schedule that fails
- replay of the known failing schedule

Commit in small logical commits and push:

git push -u team feat/runtime-observer-integration
```
