# Akil Part 2 - First Real Search Flow

Timeline: Start after Part 1 is merged or locally passing.

```text
Use Superpowers.

Continue on Akil's integration branch or create a fresh branch from dev if Part 1 is merged.

Read:
- AGENTS.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/akil.md

Task:
Implement the Gate 3 search path against the real runner.

Requirements:
- run a normal no-delay schedule first and require it to pass
- generate bounded candidate schedules using the existing deterministic delay set
- execute candidates through the real runner
- stop at the first RunResult with status "fail"
- print concise terminal output like:
  [1] postgres-ready=0ms api-start=0ms PASS
  [2] postgres-ready=500ms api-start=0ms PASS
  [3] postgres-ready=1500ms api-start=0ms FAIL

Expected outcome:
- race-debugger search can discover a real failing schedule
- search does not decide failure itself
- RunResult from Shriya's oracle is the source of truth

Verify:
npm test
npm run build
npm run typecheck

If Docker is available:
race-debugger search

Commit:
git add .
git commit -m "feat: run real schedule search"
```
