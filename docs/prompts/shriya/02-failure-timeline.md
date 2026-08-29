# Shriya Part 2 - Failure Detection and Timeline

Timeline: Start after Part 1 is passing.

```text
Use Superpowers.

Read:
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/shriya.md

Task:
Harden deterministic failure detection and timeline events.

Failure detection should prefer:
- container non-zero exit
- health timeout
- TCP/HTTP readiness failure
- fixture failure marker

Logs may support diagnosis, but should not be the only proof if a stronger signal exists.

Timeline events should include:
- container_started
- ready
- dependency_connection_attempt
- dependency_connection_failed
- timeout when relevant

Requirements:
- timeMs is relative to run start
- events are sorted before returning RunResult
- detail fields are concise and judge-readable

Expected outcome:
- failing runs explain what happened without LLM judgment
- timeline JSON can feed UI directly

Verify:
npm test
npm run build
npm run typecheck

Commit:
git add .
git commit -m "feat: add deterministic failure timeline"
```
