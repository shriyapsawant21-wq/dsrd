# Runtime–Proof Integration Implementation Plan

> Execute test-first and keep runtime lifecycle, delay injection, and schedule search outside this change.

## 1. Add deterministic log evidence parsing

**Files:**
- Create `packages/proof/src/logs/parse.ts`
- Create `packages/proof/src/logs/types.ts`
- Create `packages/proof/test/log-parser.test.ts`
- Modify `packages/proof/src/index.ts`

Write failing table-driven tests for Compose-prefixed structured JSON and raw connection-refused, timeout, and dependency-not-ready messages. Implement the smallest parser that returns stable categorized evidence and fixture timeline events. Export only the useful proof-layer API.

## 2. Teach the oracle to use parsed evidence safely

**Files:**
- Modify `packages/proof/src/oracle/types.ts`
- Modify `packages/proof/src/oracle/evaluate.ts`
- Modify `packages/proof/test/oracle.test.ts`

Add failing tests showing that parsed evidence makes an already failing/incomplete execution reason specific, while a complete machine-proven pass remains a pass despite historical error text. Add the minimal internal observation field and precedence rules.

## 3. Implement the runtime observer adapter

**Files:**
- Create `packages/proof/src/runtime-proof-observer.ts`
- Create `packages/proof/test/runtime-proof-observer.test.ts`
- Modify `packages/proof/package.json`
- Modify `packages/proof/src/index.ts`

Write integration-style tests using Riya's `ObservationSnapshot`, injected probe functions, and a fake clock. Cover a passing run and a PostgreSQL-startup failure. Implement `RuntimeProofObserver implements RunObserver`, translate service state, execute probes concurrently, parse logs, call the oracle, and return the shared `RunResult`.

## 4. Expand the fixture to four services

**Files:**
- Modify `fixtures/startup-race/compose.yaml`
- Modify `fixtures/startup-race/api/package.json`
- Modify `fixtures/startup-race/api/src/app.ts`
- Modify `fixtures/startup-race/api/test/app.test.ts`
- Modify `fixtures/startup-race/README.md`
- Modify reliability scripts if their service assumptions require it

First add a failing API test for deterministic Redis startup verification. Add Redis with a healthcheck, connect the API to it, and preserve the single PostgreSQL timing race. Update fixture documentation and assertions to cover all four services.

## 5. Add a replayable example schedule

**Files:**
- Create `fixtures/startup-race/schedules/postgres-startup-race.json`
- Modify `fixtures/startup-race/README.md`

Add an example using the shared schedule shape and document that Riya's runtime owns applying its delay. Validate it against contract expectations in a focused test if no existing schema validator is available.

## 6. Verify and commit in logical units

Run focused tests after every red/green cycle. Then run:

```powershell
npm test
npm run build
npm run typecheck
docker compose -f fixtures/startup-race/compose.yaml config
powershell -NoProfile -ExecutionPolicy Bypass -File fixtures/startup-race/scripts/verify-normal.ps1 -Runs 3
powershell -NoProfile -ExecutionPolicy Bypass -File fixtures/startup-race/scripts/verify-race.ps1 -Runs 3
```

Create small commits for parser/oracle, runtime adapter, and fixture/replay work. Push only after verification. The requested `team` remote is not configured, so resolve its URL or obtain permission to use `origin` before pushing.
