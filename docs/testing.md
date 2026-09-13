# Testing and Verification

Run focused tests while implementing a task, then run workspace typecheck:

```bash
npx vitest run packages/contracts/test
npm run typecheck
```

For a full primary-checkout validation:

```bash
npm test
```

Compose integration is Docker-gated. A missing Docker prerequisite may skip a
dedicated integration; a present daemon followed by a target/setup failure must
be reported as a failure outcome, not skipped. Record active test counts only
for the current checkout—never include nested worktrees or build output.

Repository-search API tests verify that terminal SSE events retain tested
schedule counts and redacted diagnostics, then close for every terminal phase.
