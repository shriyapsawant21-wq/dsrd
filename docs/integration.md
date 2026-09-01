# Team Integration Plan

## Branches
Use small, purpose-named branches when isolation is useful. Any contributor may
work on any package; keep package boundaries and public contracts clear.

## Integration Order

### Gate 0 — Shared contracts
Merge first:
- workspace/package skeleton
- `packages/contracts`
- shared TypeScript config if used

Nobody invents local duplicate contracts after this.

### Gate 1 — Mock integration
The search engine must run against a fake `runSchedule` implementation before Docker integration.

The runtime must run a manually supplied `Schedule` before search integration.

The oracle must classify a manually executed fixture run before search integration.

### Gate 2 — First real run
Connect:
```text
Schedule -> runtime -> proof oracle -> RunResult
```

Do not add minimization before one deterministic end-to-end run works.

### Gate 3 — Search
Connect the candidate loop to the real runner.

Success:
```text
normal run passes
candidate A passes
candidate B passes
candidate C fails
```

### Gate 4 — Artifact + replay
Save failure, then replay it.

Replay success must use the same runtime and oracle path as search execution.

### Gate 5 — Minimization
Minimize only after replay works.

### Gate 6 — UI
UI consumes output JSON. It must not become a dependency of the debugger engine.

## Merge Rules
- Pull latest shared changes before opening a PR.
- Prefer small PRs that establish an interface or one vertical capability.
- Avoid simultaneous edits to the same shared file.
- Contract changes go in separate commits/PRs when practical.
- Do not resolve a merge conflict by silently changing a public interface.

## Daily Sync Questions
Each teammate should answer:
1. What public interface did I change?
2. What can another teammate call right now?
3. What is still mocked?
4. What blocks the end-to-end flow?
5. What exact command proves my part works?

## Definition of Integrated
The project is integrated when one command path can:
```text
search -> execute -> observe -> fail -> minimize -> save -> replay -> verify
```
