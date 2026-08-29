# Shriya Part 3 - Demo Reliability

Timeline: Start after Part 2 emits stable RunResult events.

```text
Use Superpowers.

Read:
- docs/runbooks/demo.md
- docs/integration.md
- docs/plans/shriya.md
- Riya's runtime smoke proof, if available

Task:
Make the demo stack judge-safe.

Requirements:
- normal run passes consistently
- known bad schedule fails consistently
- known bad schedule represents the intended startup race
- include known-good and known-bad schedule JSON if useful
- update docs/runbooks/demo.md only if commands changed

Add repeatability proof:
- provide a command or script to run normal/failing/replay checks multiple times
- keep it lightweight enough for hackathon prep

Expected outcome:
- demo stack passes normally
- delayed readiness/start schedule fails for the intended reason
- replay comparison can rely on stable evidence

Verify:
npm test
npm run build
npm run typecheck

If Docker Desktop is available:
- run the golden demo flow at least three times

Commit:
git add .
git commit -m "test: prove demo reliability"
```
