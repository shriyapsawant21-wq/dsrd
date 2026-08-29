# Akil Part 1 - Connect Search to Real Runner

Timeline: Start after Shriya's observability branch and Riya's runtime branch are both available on `dev`.

```text
Use Superpowers.

Start from latest dev:
git switch dev
git pull team dev
git switch -c feat/search-real-runner

Read:
- AGENTS.md
- docs/plan.md
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/akil.md
- packages/contracts/src/index.ts
- packages/runtime/src/index.ts

Your ownership:
Schedule exploration engine and CLI orchestration.

Do not implement:
- Docker lifecycle
- delay injection
- HTTP/TCP probes
- pass/fail oracle

Task:
Replace the fake/mock run function with the real runtime entrypoint while keeping the search engine dependent only on:

(schedule: Schedule) => Promise<RunResult>

Expected outcome:
- existing fake-runner unit tests still pass
- a real runner adapter exists
- search can call the real runtime without importing Docker internals

Verify:
npm test
npm run build
npm run typecheck

Commit:
git add .
git commit -m "feat: connect scheduler to runtime runner"
```
