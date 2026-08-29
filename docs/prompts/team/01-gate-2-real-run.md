# Team Part 1 - Gate 2 Real Run

Timeline: Start after Akil, Riya, and Shriya post-work branches are merged or locally integrated.

```text
Use Superpowers.

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

Task:
Prove Gate 2:

Schedule -> Riya runtime -> Shriya oracle -> RunResult

Requirements:
- execute one normal no-delay schedule
- execute one known bad schedule
- confirm both return shared RunResult
- confirm status comes from oracle
- confirm runtime cleanup after both runs

Verify:
npm test
npm run build
npm run typecheck

Commit:
git add .
git commit -m "test: prove first real run integration"
```
