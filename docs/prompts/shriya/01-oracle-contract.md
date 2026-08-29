# Shriya Part 1 - Oracle Contract Stabilization

Timeline: Start after Shriya's first observability/demo branch is available.

```text
Use Superpowers.

Start from latest dev:
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
- Riya's runtime files

Your ownership:
Proof layer, timeline evidence, and demo reliability.

Do not implement:
- schedule search
- minimization
- Docker lifecycle policy
- replay orchestration

Task:
Stabilize the oracle input/output with Riya's runtime.

Requirements:
- define the smallest observation input shape needed internally
- keep public output as shared RunResult
- avoid changing shared contracts unless all owners agree
- make failureReason stable enough for replay comparison

Expected outcome:
- Riya can call the oracle with runtime observations
- Akil can trust RunResult.status and failureReason

Verify:
npm test
npm run build
npm run typecheck

Commit:
git add .
git commit -m "feat: stabilize oracle runtime contract"
```
