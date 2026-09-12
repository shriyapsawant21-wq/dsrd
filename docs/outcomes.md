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
