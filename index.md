# DSRD Repository Onboarding Index

The portable onboarding implementation follows the fixed pipeline:

```text
checkout or pinned Git URL → inspect → select/configure → prepare
→ fresh attempt → discover → minimize → ordered replay → artifact
```

## Entry points

- [Implementation progress](progress.md)
- [Onboarding architecture](docs/superpowers/specs/2026-09-12-repository-onboarding-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-12-repository-onboarding.md)
- [Shared contracts](docs/contracts/shared-contracts.md)
- [Demo runbook](docs/runbooks/demo.md)

## Current capabilities

- Inspect checkout paths without running project scripts.
- Detect Compose, validated local-process manifests, and Kubernetes YAML
  candidates.
- Require explicit target selection for ambiguous repositories.
- Parse strict `dsrd.yaml` configuration with field-path diagnostics.
- Resolve a pinned Git ref to a detached revision and produce an input digest.

Execution remains gated by adapter capabilities, explicit readiness assertions,
safe state ownership/reset rules, and repeated deterministic evidence.
