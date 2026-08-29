# Riya Part 2 - Demo Stack Repeatability

Timeline: Start after Part 1 is passing.

```text
Use Superpowers.

Read:
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/riya.md
- Shriya's demo compose files

Task:
Make Riya's runtime execute Shriya's demo stack repeatably.

Requirements:
- support the demo compose file path/project name expected by the fixture
- clean reset before every experiment
- cleanup after success, failure, timeout, and thrown errors
- preserve logs and metadata even when the app fails
- keep replay on the same execution path as runSchedule

Expected outcome:
- one normal no-delay schedule passes
- one known bad schedule fails
- repeated runs do not leave stale containers, networks, or volumes

Verify:
npm test
npm run build
npm run typecheck

If Docker Desktop is available:
- run one normal demo schedule
- run one known failing schedule
- run replay for the known failing schedule

Commit:
git add .
git commit -m "feat: make demo runtime repeatable"
```
