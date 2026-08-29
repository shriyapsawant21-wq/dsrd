# Akil Part 3 - Artifact, Replay, and Minimization

Timeline: Start only after `race-debugger search` can find one real failure.

```text
Use Superpowers.

Read:
- docs/contracts/shared-contracts.md
- docs/integration.md
- docs/runbooks/demo.md
- docs/plans/akil.md

Task:
Finish Gate 4 and Gate 5.

Build:
1. Save `failure.json` using the shared FailureArtifact shape.
2. Include:
   - version
   - createdAt
   - originalSchedule
   - minimizedSchedule
   - expectedFailureReason
   - events
3. Implement replay command:
   race-debugger replay failure.json
4. Replay must call the same runtime + oracle path as search.
5. Implement greedy minimization:
   - remove unnecessary perturbations one at a time
   - lower remaining delays stepwise
   - keep a simplification only if the same expected failure still reproduces

Expected outcome:
- search saves a replayable artifact
- replay verifies the saved failure
- minimization produces a smaller stable schedule

Verify:
npm test
npm run build
npm run typecheck
race-debugger search
race-debugger replay failure.json

Commit:
git add .
git commit -m "feat: save replayable minimized failure"
```
