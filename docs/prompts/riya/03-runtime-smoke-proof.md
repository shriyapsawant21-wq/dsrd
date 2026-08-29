# Riya Part 3 - Runtime Smoke Proof

Timeline: Start after Part 2 can run the demo stack locally.

```text
Use Superpowers.

Read:
- docs/runbooks/demo.md
- docs/integration.md
- docs/plans/riya.md

Task:
Add the smallest useful runtime smoke proof for teammates.

Build:
- a script or documented command that runs a normal schedule
- a script or documented command that runs a known failing schedule
- a script or documented command that runs replay
- make Docker-dependent checks skippable when Docker is unavailable

Expected outcome:
- Akil can cross-check the runtime before wiring search
- Shriya can cross-check oracle input/output
- judges can see cleanup/replay reliability during demo prep

Verify:
npm test
npm run build
npm run typecheck

If Docker Desktop is available, run the smoke proof twice.

Commit:
git add .
git commit -m "test: add runtime smoke proof"
```
