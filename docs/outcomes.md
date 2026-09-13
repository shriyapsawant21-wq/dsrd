# Experiment Outcomes

Outcome classification is evidence-first.

| Outcome | Meaning | Artifact |
| --- | --- | --- |
| `found_failure` | Healthy baseline, repeated matching failure, minimized and independently replayed | Verified v3 only |
| `no_failure` | Bounded exploration completed without a confirmed failure | Never |
| `target_unhealthy` | Baseline is consistently unhealthy | Never |
| `needs_configuration` | Required execution meaning is absent | Never |
| `unsupported_target` | No adapter/capability can safely execute it | Never |
| `execution_error` | Setup, command, timeout, cleanup, or platform failure | Never |
| `inconclusive` | Evidence is inconsistent or budget is exhausted | Never |
| `cancelled` | Caller aborted the operation | Never |

`ECONNREFUSED`, `timeout`, and comparable log text are diagnostic timeline
evidence only. A failure requires an unexpected terminal exit, failed declared
readiness assertion, structured application failure, or terminal job mismatch.

CLI JSON mode emits one terminal record with `status` and `exitCode` and no
progress noise. Discovery outcomes map to process codes: `0` for
`found_failure`/`no_failure`, `2` for `needs_configuration`, `3` for
`unsupported_target`, `4` for `target_unhealthy`, `5` for `execution_error`,
`6` for `inconclusive`, and `130` for `cancelled`. JSON setup errors also use
the stable `execution_error`/`5` pair; they are never reclassified as
`no_failure`.
