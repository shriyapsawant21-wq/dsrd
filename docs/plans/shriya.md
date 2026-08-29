# Shriya Plan - Observability, Failure Detection, and Demo Stack

## Ownership

Shriya owns the proof layer: the demo application, readiness checks, failure detection, logs, and timeline events that explain what happened.

## Main Goal

Build the part of the system that answers:

> What actually happened during startup, and why did this schedule fail?

## Responsibilities

1. Build the four-service demonstration stack.
2. Add a realistic startup race bug.
3. Implement HTTP readiness checks.
4. Implement TCP readiness checks.
5. Detect pass or fail for each schedule.
6. Capture important timeline events.
7. Provide event JSON for the AI-generated UI.
8. Make the demo reliable enough for judging.

## Tech Stack

### Demo App

- Node.js
- Express
- PostgreSQL
- Docker Compose
- Optional Redis or simple frontend

### Observability

- HTTP readiness checks using `fetch`
- TCP checks using Node's `net` module
- Docker logs through Riya's Docker controller
- JSON timeline output

## Demo Stack

Recommended services:

1. `postgres`
   - Real PostgreSQL database.
   - Readiness can be delayed or naturally slow.

2. `api`
   - Express service.
   - Attempts to connect to Postgres on startup.
   - Intentionally fails if Postgres is not ready.
   - Has `/health` endpoint.

3. `worker`
   - Calls API shortly after startup.
   - Helps expose timing assumptions.

4. `frontend` or `cache`
   - Simple frontend for demo realism, or Redis for another dependency.

## Intentional Race Bug

The API should make a startup-time database connection attempt without robust retry logic.

Example behavior:

```txt
API starts at 0ms
API tries PostgreSQL at 420ms
PostgreSQL becomes ready at 1800ms
API fails startup because it assumed PostgreSQL was ready
```

This is realistic because many services incorrectly assume dependency containers are ready as soon as they are started.

## Readiness Checks

### HTTP Readiness

For API:

```http
GET /health
```

Expected ready response:

```json
{
  "status": "ok"
}
```

### TCP Readiness

For Postgres:

```txt
host: localhost or service hostname
port: 5432
```

A successful TCP connection means the port is accepting connections.

## Timeline Events

Output events like:

```json
[
  {
    "timeMs": 0,
    "service": "api",
    "event": "container_started"
  },
  {
    "timeMs": 420,
    "service": "api",
    "event": "db_connection_failed",
    "detail": "ECONNREFUSED"
  },
  {
    "timeMs": 1800,
    "service": "postgres",
    "event": "ready"
  }
]
```

## Failure Detection

For the MVP, a run fails if any of these happen:

1. API container exits during startup.
2. Worker receives a connection error.
3. `/health` does not become ready within timeout.
4. Logs contain known failure markers like:

```txt
ECONNREFUSED
connection refused
database is not ready
startup failed
```

## Day 1 Tasks

- Build the demo Docker Compose stack.
- Implement API service.
- Implement Postgres dependency.
- Add intentional missing retry behavior.
- Add basic `/health` endpoint.

## Day 2 Tasks

- Implement HTTP and TCP readiness checks.
- Implement pass/fail detection.
- Emit timeline events as JSON.
- Connect event output to Akil's result contract.

## Day 3 Tasks

- Make race reliable.
- Tune failure timing.
- Prepare clean demo data.
- Validate the timeline makes sense to judges.

## Done Criteria

Shriya's part is done when one run can produce:

```json
{
  "status": "fail",
  "failureReason": "API attempted PostgreSQL connection before PostgreSQL was ready",
  "events": [
    {
      "timeMs": 0,
      "service": "api",
      "event": "container_started"
    },
    {
      "timeMs": 420,
      "service": "api",
      "event": "db_connection_failed"
    },
    {
      "timeMs": 1800,
      "service": "postgres",
      "event": "ready"
    }
  ]
}
```

