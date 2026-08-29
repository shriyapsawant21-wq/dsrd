# Review rules

- Pass/fail decisions must remain deterministic and must not use an LLM.
- Shared `Schedule`, `TimelineEvent`, `RunResult`, and `FailureArtifact` types must come from `packages/contracts`.
- Flag changes that cross the ownership boundaries documented in `AGENTS.md`.
- Flag nondeterministic ordering, timing assumptions, stale observations, leaked background work, and platform-specific identity handling.
- Require tests for deterministic components and evidence for claims that a demo or replay works.
- Do not request UI, authentication, billing, deployment, or unrelated platform work.
