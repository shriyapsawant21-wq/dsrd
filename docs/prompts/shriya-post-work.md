# Shriya Prompt - Post-Work Follow-Up

Use this after Shriya's first `feat/observability` work is pushed or merged and the team is ready for Shriya's next reliability pass.

```text
Use Superpowers.

You are working on DSRD after your first observability/demo-stack branch is available.

Start from the latest dev:

git switch dev
git pull team dev
git switch -c feat/demo-reliability

Read:
- AGENTS.md
- docs/plan.md
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/shriya.md
- packages/contracts/src/index.ts
- packages/runtime/src/runtime-controller.ts
- Akil's scheduler/CLI files
- Riya's runtime files

Your ownership remains proof layer, timeline evidence, and demo reliability.

Do not implement schedule search, minimization, Docker lifecycle policy, or replay orchestration.

Build the Gate 2 and demo-hardening work:

1. Stabilize the oracle contract with Riya's runtime.
   - Define the smallest observation input shape needed by the oracle.
   - Keep the public output as shared `RunResult`.
   - Avoid changing shared contracts unless all owners need the change.

2. Improve deterministic failure detection.
   - Prefer machine-verifiable signals: container exit, health timeout, TCP/HTTP readiness, fixture failure marker.
   - Use logs as supporting evidence.
   - Make `failureReason` stable enough for replay comparison.

3. Harden timeline events.
   - Emit events for container start, readiness, connection attempt, failure, and timeout.
   - Keep `timeMs` relative to the run start.
   - Sort events before returning `RunResult`.

4. Make the demo stack judge-safe.
   - Normal run should pass consistently.
   - Known bad schedule should fail consistently.
   - Include a small known-good schedule JSON and known-bad schedule JSON if useful.
   - Update `docs/runbooks/demo.md` only if commands changed.

5. Add repeatability proof.
   - Provide a command or script to run normal/failing/replay checks multiple times.
   - Keep it lightweight enough for hackathon demo prep.

Definition of done:
- The demo stack passes normally.
- The known bad schedule fails for the intended startup race.
- Oracle returns timeline-rich `RunResult`.
- Replay comparison can rely on stable failure reason and evidence.

Verify before finishing:

npm test
npm run build
npm run typecheck

If Docker Desktop is available, run the golden demo flow from docs/runbooks/demo.md at least three times.

Commit in small logical commits and push:

git push -u team feat/demo-reliability
```
