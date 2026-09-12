# Repository Configuration

`dsrd.yaml` is strict and versioned. It describes an explicitly selected
target, workloads, readiness assertions, state policy, bindings, and
experiment limits. Unknown fields and invalid dependency references are
rejected with field-path diagnostics.

```yaml
version: 1
target:
  id: process:app
  adapter: local-process
  root: .
workloads:
  api:
    kind: service
    command: [node, dist/server.js]
    readiness:
      id: api-ready
      type: http
      url: http://127.0.0.1:3000/health
      observer: host
      expectedStatus: 200
state: { policy: fresh-owned }
experiment:
  baselineRuns: 3
  confirmationRuns: 3
  replayRuns: 3
```

Compose targets require launch files. Local long-running workloads require an
explicit readiness assertion. A target with missing launch commands, readiness,
secrets, or safe reset behavior returns `needs_configuration`; DSRD must not
guess those values.
