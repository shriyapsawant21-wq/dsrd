# Startup Race Fixture

This fixture is the proof layer's intentionally vulnerable demonstration application. It contains four real services:

```text
postgres -> api -> worker
cache ------^
```

## What each service does

- `postgres` runs the official PostgreSQL image through `postgres/delayed-entrypoint.sh`. `POSTGRES_START_DELAY_MS` defaults to `0`; a controlled experiment may set it to a non-negative millisecond delay.
- `cache` runs Redis and supplies a second real backend dependency without adding UI work or another intentional race.
- `api` performs one PostgreSQL `SELECT 1` and one Redis `PING` startup check. It starts Express only after both succeed. It intentionally does not retry, so an early start while PostgreSQL is unavailable emits `db_connection_failed` and exits non-zero.
- `worker` makes one request to `GET /work`. It emits `work_succeeded` and exits zero only for HTTP 200 plus `{ "status": "processed" }`.

## Why normal startup passes

The normal Compose dependencies are health-gated:

```text
PostgreSQL healthy --\
                     -> API starts and becomes healthy -> worker starts
Redis healthy -------/
```

Run the bounded verification helper:

```powershell
powershell -ExecutionPolicy Bypass -File fixtures/startup-race/scripts/verify-normal.ps1 -Runs 3
```

The helper requires PostgreSQL, Redis, and API to become healthy and the worker to exit with code 0.

## Why the intended timing fails

The race helper starts healthy Redis, delays the PostgreSQL process, then starts the API immediately with Compose dependency startup disabled for that command:

```text
PostgreSQL container starts but process sleeps
  -> API starts
  -> API's only database attempt is refused
  -> API emits db_connection_failed
  -> API exits non-zero
  -> PostgreSQL becomes ready later
```

Run it with:

```powershell
powershell -ExecutionPolicy Bypass -File fixtures/startup-race/scripts/verify-race.ps1 -Runs 3
```

The non-zero API exit is the primary machine-verifiable failure signal. The structured event is diagnostic timeline evidence; an arbitrary log string alone is not the failure oracle.

## Local ports

- PostgreSQL: `localhost:55432`
- Redis: `localhost:56379`
- API health: `http://localhost:53000/health`

## Replay schedule

`schedules/postgres-startup-race.json` is the four-service example schedule passed across the shared `Schedule` boundary. Riya's runtime owns applying its timing fields and executing the services. The proof layer only observes that execution and returns `RunResult`.

Copy `.env.example` values or override host ports if either port is occupied.

## Structured fixture events

The services emit one-line JSON events that Riya's runtime can timestamp and provide to the proof package:

- `postgres/startup_delay_applied`
- `api/db_connection_attempted`
- `api/db_connection_succeeded`
- `api/db_connection_failed`
- `api/cache_connection_succeeded`
- `api/cache_connection_failed`
- `api/http_server_listening`
- `worker/work_succeeded`
- `worker/api_request_failed`

## Ownership boundary

The PowerShell files are fixture verification helpers, not the reusable Docker runtime. Riya's runtime owns reset, controlled service startup, schedule delay injection, logs, and replay execution. Akil owns search and minimization. The proof package owns readiness observations, deterministic classification, and timeline construction.
