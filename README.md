# DSRD — Distributed Startup Race Debugger

A local startup-race debugger for Docker Compose, local-process, and optional Kubernetes targets. It actively explores startup timing to discover, minimize, and replay hidden readiness failures.

## Core Idea

```text
 normal application target
      -> perturb startup timing
      -> execute repeatedly
      -> detect a failing schedule
      -> minimize it
      -> save failure.json
      -> replay the same failure
      -> show a timeline
```

This is a dynamic debugger, not an AI log summarizer or static Compose linter.

## Why use DSRD

DSRD changes execution timing and relies on deterministic runtime evidence from
the failure oracle. That means it can produce a minimized, replayable
counterexample for a race that a normal startup, static dependency graph, or
log summary can miss. The saved artifact includes the target and schedule, so
replay follows the same platform and oracle path as discovery.

## Quick start

```bash
npm install
npm run build
race-debugger search --platform local-process --target fixtures/local-startup-race/manifest.json --delay-options 0,100 --output failure.json
race-debugger replay failure.json
```

Use `compose` with a Compose file, or `local-process` with a local-process
manifest. Kubernetes remains optional: it requires `kubectl` and a disposable
cluster only when `--platform kubernetes` is selected.

```bash
race-debugger search --platform kubernetes --target fixtures/kubernetes-startup-race/manifest.yaml --delay-options 0,1500 --output kubernetes-failure.json
race-debugger replay kubernetes-failure.json
```

For the supplied local Kind fixture, create/select the `kind-dsrd-c7` context
before running the Kubernetes command. No kubeconfig, token, or cluster is
needed for Compose and local-process workflows.

## Team
- Akil — schedule exploration, minimization, CLI
- Riya — Docker Compose runtime and delay injection
- Shriya — observability, failure oracle, demo fixture

## Documentation
- [`AGENTS.md`](AGENTS.md) — shared Codex/project rules
- [`docs/plan.md`](docs/plan.md) — overall architecture and hackathon plan
- [`docs/contracts/shared-contracts.md`](docs/contracts/shared-contracts.md) — shared interfaces
- [`docs/integration.md`](docs/integration.md) — team integration workflow
- [`docs/plans/akil.md`](docs/plans/akil.md) — Akil plan
- [`docs/plans/riya.md`](docs/plans/riya.md) — Riya plan
- [`docs/plans/shriya.md`](docs/plans/shriya.md) — Shriya plan
- [`docs/runbooks/demo.md`](docs/runbooks/demo.md) — golden demo runbook

## Target CLI

### Interactive dashboard

Run `race-debugger` with no command from a terminal to open the DSRD dashboard and choose Search, Replay, or Quit.
The guided search uses numbered Docker Compose/local-process choices, validates the selected file, and offers a recommended Quick scan that tests one perturbation at a time. Choose Thorough scan only when you intentionally want the larger Cartesian search.

### Scriptable commands

```bash
race-debugger search --platform local-process --target fixtures/local-startup-race/manifest.json
race-debugger search --platform compose --target fixtures/startup-race/compose.yaml
race-debugger replay failure.json
```

The production CLI routes local-process targets to the local runtime and Compose targets to the Docker Compose runtime. Kubernetes targets return a clear unsupported message until C7 is integrated.

### PowerShell and POSIX replay hints

When an artifact path contains spaces, shell metacharacters, or apostrophes, use the shell-specific replay command printed after a failed search. The CLI prints separately labeled PowerShell and POSIX commands so that copied paths retain their exact value.

## Local Web Interface

Start the API and web app in two terminals:

```powershell
npm run build
npm run dev:api
```

```powershell
npm run dev:web
```

Open `http://127.0.0.1:5173`, scroll to `INITIALIZE_SEQUENCE`, and upload a `.yaml` or `.yml` Docker Compose file. The interface streams real exploration progress, shows the deterministic failure report, exposes its event timeline, and downloads the `FailureArtifact` JSON.

The current upload contract accepts one self-contained Compose file. Compose projects that reference local build contexts, env files, bind-mounted source, or other companion files need archive/project-directory staging before they can run from a browser upload.

## MVP Definition of Done
A bug is only considered discovered when a normally working fixture fails under an explored schedule, the failure is automatically detected, the schedule is minimized, and replay reproduces the same expected failure.
