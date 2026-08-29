# Riya Part 1 - Runtime to Oracle Integration

Timeline: Start after Shriya's observability branch is available on `dev`.

```text
Use Superpowers.

Start from latest dev:
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

Your ownership:
Docker Compose execution and perturbation.

Do not implement:
- search strategy
- minimization
- pass/fail oracle policy

Task:
Connect runtime observations to Shriya's oracle/observer adapter.

Runtime should:
- execute a provided Schedule
- collect container metadata, logs, start timing, and cleanup state
- pass observation data to Shriya's oracle
- return the shared RunResult shape

Expected outcome:
- runtime does not decide pass/fail itself
- RunResult.status comes from Shriya's proof layer
- existing runtime tests still pass

Verify:
npm test
npm run build
npm run typecheck

Commit:
git add .
git commit -m "feat: connect runtime to oracle"
```
