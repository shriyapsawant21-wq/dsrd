# Team Part 3 - Gate 5 and Gate 6

Timeline: Start after Team Part 2 passes.

```text
Use Superpowers.

Read:
- docs/integration.md
- docs/runbooks/demo.md
- docs/plan.md

Task:
Finish the judge-ready flow:

search -> execute -> observe -> fail -> minimize -> save -> replay -> verify -> timeline UI

Requirements:
- minimization produces a smaller stable reproducer
- replay verifies the minimized schedule
- timeline events are exported as JSON
- UI consumes output JSON only
- docs/runbooks/demo.md matches the exact commands used in the demo
- create a backup known-good artifact for judging

Verification target:
- run full golden demo five consecutive times on the primary laptop
- run it once on another teammate machine

Verify:
npm test
npm run build
npm run typecheck
race-debugger search
race-debugger replay failure.json

Commit:
git add .
git commit -m "feat: finish minimized demo flow"
```
