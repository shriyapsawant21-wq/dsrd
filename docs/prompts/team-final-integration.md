# Team Prompt - Final Demo Integration

Use this once the three post-Shriya branches are merged into `dev`.

```text
Use Superpowers.

You are doing final DSRD integration. Follow docs/integration.md exactly.

Start from latest dev:

git switch dev
git pull team dev
git switch -c feat/final-demo-flow

Read:
- AGENTS.md
- docs/plan.md
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- packages/contracts/src/index.ts
- all package README files, if present

Goal:
Make one command path demonstrate:

search -> execute -> observe -> fail -> minimize -> save -> replay -> verify

Rules:
- UI consumes output JSON only.
- Do not change shared contracts casually.
- Do not duplicate replay, Docker orchestration, or oracle logic.
- Keep the golden demo reliable before adding polish.

Tasks:
1. Run full repository checks.
2. Run normal demo startup and confirm it passes.
3. Run search and confirm it finds a real failing schedule.
4. Confirm `failure.json` matches `FailureArtifact`.
5. Run replay and confirm the expected failure reproduces.
6. Confirm minimization produces a smaller stable schedule.
7. Confirm timeline JSON/events are available for the UI.
8. Update docs/runbooks/demo.md with exact commands only if reality differs from the current runbook.
9. Create a backup known-good artifact for judging.

Verify:

npm test
npm run build
npm run typecheck

Then run the golden demo at least five consecutive times on the primary laptop and once on another teammate's laptop.

Commit and push:

git push -u team feat/final-demo-flow
```
