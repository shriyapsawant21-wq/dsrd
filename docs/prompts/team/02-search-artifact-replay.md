# Team Part 2 - Gate 3 and Gate 4

Timeline: Start after Team Part 1 passes.

```text
Use Superpowers.

Read:
- docs/integration.md
- docs/runbooks/demo.md
- docs/contracts/shared-contracts.md

Task:
Prove:

search -> execute -> observe -> fail -> save -> replay

Requirements:
- race-debugger search discovers a real failing schedule
- failure.json matches FailureArtifact
- race-debugger replay failure.json reproduces the expected failure
- replay uses the same runtime and oracle path as search

Verify:
npm test
npm run build
npm run typecheck
race-debugger search
race-debugger replay failure.json

Commit:
git add .
git commit -m "test: prove search artifact replay flow"
```
