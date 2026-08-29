# Akil Prompt - Post-Work Integration

Use this after Shriya's `feat/observability` work is pushed or merged and the team is ready for Akil's next integration work.

```text
Use Superpowers.

You are working on DSRD after Shriya's observability/demo-stack work is available.

Start from the latest dev:

git switch dev
git pull team dev
git switch -c feat/search-real-runner

Read:
- AGENTS.md
- docs/plan.md
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/akil.md
- packages/contracts/src/index.ts
- packages/runtime/src/index.ts
- packages/runtime/src/runtime-controller.ts
- Shriya's observability package/source files

Your ownership remains schedule exploration, minimization, failure artifact serialization, replay command orchestration, and CLI flow.

Do not implement Docker lifecycle, delay injection, HTTP/TCP probes, or pass/fail oracle logic.

Build the Gate 3 through Gate 5 path:

1. Replace the mock/fake schedule runner with the real runtime entrypoint.
   - The search engine should depend only on `(schedule: Schedule) => Promise<RunResult>`.
   - Keep existing unit tests that use fake runners.
   - Add an integration test or script that uses Riya's runtime and Shriya's oracle path when Docker is available.

2. Implement the first real search flow.
   - Normal startup must pass before searching for failures.
   - Generate bounded candidate schedules using the existing deterministic delay set.
   - Stop at the first `RunResult.status === "fail"`.
   - Print concise schedule results without flooding the terminal.

3. Save the failure artifact.
   - Write `failure.json` using the shared `FailureArtifact` shape.
   - Include the original failing schedule, minimized schedule when available, expected failure reason, and timeline events.
   - Validate the JSON shape before writing.

4. Wire replay through the same runtime and oracle path.
   - `race-debugger replay failure.json` must execute the saved minimized schedule.
   - Replay success means the expected failure is reproduced by the same pass/fail oracle, not by checking strings in the artifact.

5. Implement or finish minimization only after replay works.
   - Remove unnecessary perturbations one at a time.
   - Lower remaining delay values stepwise.
   - Re-run after each proposed simplification.
   - Keep the simpler schedule only if the oracle still reports the expected failure.

Definition of done:
- `race-debugger search` performs a real run against the demo stack.
- At least one candidate fails automatically.
- `failure.json` is written.
- `race-debugger replay failure.json` reproduces the expected failure.
- Minimization runs after replay and keeps a smaller stable schedule.

Verify before finishing:

npm test
npm run build
npm run typecheck

If Docker is available, also run the golden demo flow from docs/runbooks/demo.md.

Commit in small logical commits and push:

git push -u team feat/search-real-runner
```
