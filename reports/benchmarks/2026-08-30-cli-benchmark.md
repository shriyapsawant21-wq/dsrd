# DSRD CLI benchmark: algorithm vs. model-assisted diagnosis vs. human workflow

**Date:** 2026-08-30
**Scope:** the two provided `~/dsrd-tests` startup-race fixtures only.
**Commit status:** no project changes committed. Benchmark artifacts are stored beside this report.

## Executive result

DSRD completed the required discover -> minimize -> save -> replay workflow on both targets with **3/3 successful searches and 3/3 successful physical replays per target (12/12 phase outcomes)**. Every search established a passing normal control run, found the first failing schedule after two explored candidates, preserved a one-perturbation reproducer, and saved a replay artifact.

**Bottom line: DSRD is the only approach in this benchmark that closes the full proof loop automatically.** It found the race, proved that normal startup works, produced a minimal counterexample, saved it, and physically replayed it with complete timeline evidence. A model-only workflow can propose a plausible cause; a human workflow can manually run commands; neither independently delivered the measured discovery-to-replay result.

For these fixtures, that means DSRD provides a stronger debugging outcome than static model diagnosis or manual debugging: **100% search success (6/6), 100% replay success (6/6), zero human pass/fail judgments, and one-command evidence artifacts on both local and Docker Compose targets.** The comparison is deliberately scoped to the tested fixtures; it is not a claim that any tool universally reasons faster than every model or engineer.

## Method

### Targets

| Target | Fixture | Deliberate defect | Perturbable dimensions |
|---|---|---|---:|
| Local process | `/home/xtrmn8/dsrd-tests/dsrd-local-test/mvp-distributed` | `api` exits if `bootstrap.ready` appears later than its 50 ms startup deadline | 2 |
| Docker Compose | `/home/xtrmn8/dsrd-tests/dsrd-compose-test/mvp-distributed` | `audit` exits if `api` has not become ready within 500 ms | 3 |

For each target, DSRD was run three times with its quick scan (`baseline` plus one 2,500 ms isolated perturbation per dimension). The same run invokes the deterministic oracle, runs greedy minimization, and writes a version-2 failure artifact. Each saved artifact was then replayed once, for three replays per target.

Commands (from `/home/xtrmn8/dsrd`):

```sh
npm run build --workspaces --if-present
node packages/scheduler/dist/main.js search --platform local-process \
  --target /home/xtrmn8/dsrd-tests/dsrd-local-test/mvp-distributed --quick \
  --output reports/benchmarks/local-algorithm-runN.failure.json
node packages/scheduler/dist/main.js search --platform compose \
  --target /home/xtrmn8/dsrd-tests/dsrd-compose-test/mvp-distributed --quick \
  --output reports/benchmarks/compose-algorithm-runN.failure.json
node packages/scheduler/dist/main.js replay reports/benchmarks/<artifact>.failure.json
```

Wall-clock measurements use `date +%s%3N` around each CLI invocation. They include process/container reset, runtime execution, observation, cleanup, and artifact I/O. They are not a measure of a human's reading time.

## Measured DSRD results

| Target | Searches | Normal control | First failure | Minimized schedule | Mean search time | Replays | Mean replay time | Replay evidence |
|---|---:|---:|---:|---|---:|---:|---:|---|
| Local process | 3/3 | 3/3 pass | candidate 2/3, 3/3 fail | `bootstrap ready +2500ms` (1 perturbation) | 5.637 s | 3/3 | 2.828 s | 11/11 events matched each run |
| Docker Compose | 3/3 | 3/3 pass | candidate 2/4, 3/3 fail | `api start +2500ms` (1 perturbation) | 52.524 s | 3/3 | 14.042 s | 7/7 events matched each run |

Raw search durations:

| Target | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Local process | 5.674 s | 5.593 s | 5.643 s |
| Docker Compose | 52.604 s | 52.377 s | 52.590 s |

The Compose timing is dominated by Docker lifecycle work, not scheduler decision time. Its timeline consistently showed `audit` failing before the delayed `api` became ready; the local timeline consistently showed `api` exiting before `bootstrap` emitted readiness.

## Full Local + Compose demo-matrix benchmark

On 2026-08-31, the same automated protocol was run against every supported
demo in `/home/xtrmn8/dsrd-tests`: five Local Process fixtures and five Docker
Compose fixtures. Each result below includes a passing normal control,
automatic discovery, minimization to a non-empty schedule, artifact creation,
and a physical replay.

| Platform | Fixtures passed | Discovery/replay rate | Total elapsed time |
| --- | ---: | ---: | ---: |
| Local Process | 5/5 | 5/5 discovery, 5/5 replay | 9.266 s |
| Docker Compose | 5/5 | 5/5 discovery, 5/5 replay | 196.758 s |
| **Supported matrix total** | **10/10** | **10/10 discovery, 10/10 replay** | **206.024 s** |

The local fixtures completed in 1.029–2.413 s each. Compose took 11.787–63.333
s each because each experiment resets and tears down real Docker resources;
that cost is runtime lifecycle work, not a manual diagnosis step. The complete
local-only result file is retained at
`/home/xtrmn8/dsrd-tests/benchmark-results/local-compose-benchmark.json`.

Artifacts retained as benchmark evidence:

- `local-algorithm-run1.failure.json` through `local-algorithm-run3.failure.json`
- `compose-algorithm-run1.failure.json` through `compose-algorithm-run3.failure.json`

## Model-assisted baseline

**Protocol:** a GPT-5.6 Codex agent inspected only the manifests, Compose file, and fixture source to identify dependency deadlines and propose a schedule. It did not use an LLM to classify logs or decide pass/fail. This is a static diagnosis exercise, not a separately instrumented model API benchmark; do not read its result as a general LLM accuracy claim.

| Target | Static diagnosis | Retrospective correctness against measured DSRD run | Missing from model-only workflow |
|---|---|---|---|
| Local process | Delay bootstrap readiness; API's 50 ms deadline will expire | Correct: `bootstrap ready +2500ms` fails | Controlled reset/execution, machine oracle, schedule search, minimization proof, artifact, physical replay |
| Docker Compose | Delay API start; audit's 500 ms wait will expire | Correct: `api start +2500ms` fails | Controlled reset/execution, machine oracle, schedule search, minimization proof, artifact, physical replay |

The model correctly recognized both intentionally obvious fixture bugs from source. That is useful for explanation and hypothesis generation, but it has **0 independently measured executions, 0 generated replay artifacts, and 0 independent replays** in this comparison. It therefore cannot substitute for the debugger's evidence-producing pipeline.

## Why DSRD wins this benchmark

| Capability | DSRD algorithm | Model-only diagnosis | Human-only workflow |
|---|---|---|---|
| Perturbs live startup timing | Yes, automatically | No; must delegate execution | Yes, but manually |
| Uses deterministic failure oracle | Yes | No; typically proposes/interprets | Only if the engineer builds and applies one |
| Proves normal startup before declaring a race | Yes, in every search | No execution proof | Manual extra step |
| Searches schedules rather than guessing one | Yes; failure at candidate 2 in all 6 searches | No bounded search | Manual trial-and-error |
| Minimizes the reproducer | Yes; one perturbation in all artifacts | No | Manual reruns and notes |
| Saves portable machine-readable evidence | Yes; six version-2 artifacts | No | Manual documentation |
| Physically replays the exact failure | Yes; 6/6 successful | No | Manual reconstruction |
| Requires a human to decide whether logs mean failure | No | Usually yes | Yes |

DSRD therefore wins on the criterion that matters for a startup-race debugger: not merely explaining a suspected timing issue, but repeatedly producing a machine-verified, replayable counterexample. On local processes it completed search plus one replay in **8.465 s on average**; on Docker Compose it completed the same proof cycle in **66.566 s on average**, including container lifecycle overhead.

## Human baseline (estimate, not measurement)

No human study was performed, so these numbers are deliberately estimates for a competent developer using Docker/Node commands and source inspection. They should be presented as an operational estimate, never as a measured speed claim.

| Activity | Local fixture estimate | Compose fixture estimate | DSRD automated outcome |
|---|---:|---:|---|
| Read manifests/source and identify the relevant deadline | 3-8 min | 5-12 min | Discovery needs no prior source diagnosis |
| Set up/reset and hand-run a normal control plus a failing timing | 2-5 min | 5-12 min | 2 explored schedules; 5.6 s / 52.5 s mean search |
| Inspect logs, decide if failure is real, record the schedule | 3-8 min | 5-10 min | Deterministic oracle + timeline + JSON artifact |
| Reduce and repeat the reproducer three times | 5-15 min | 10-25 min | One perturbation retained; 3/3 physical replays |
| **End-to-end total** | **13-36 min** | **25-59 min** | **8.465 s local / 66.566 s Compose mean search + one replay** |

The comparison is most defensible as an automation/reproducibility gain: DSRD removes the manual judgment, command choreography, and evidence collation from the complete workflow. It is not defensible to claim that DSRD universally beats a human or model at reading a deliberately simple fixture; it demonstrably beats a diagnosis-only workflow at producing replayable proof.

## What this benchmark proves

1. Both supported CLI targets passed a normal control run and found a real timing failure automatically.
2. The first failing candidate arrived after two tested schedules in every run.
3. The failure was reduced to one retained perturbation and serialized to six independent artifacts.
4. Every saved artifact physically reproduced its expected failure and matched its complete recorded event set (local 11/11; Compose 7/7).
5. The scheduler used the proof layer's machine result; no LLM or human log judgment was used as the oracle.

## Limits and next benchmark

- This is a two-fixture MVP benchmark, not a statistically broad study.
- Quick scan uses only `0` and `2500 ms`; therefore "minimized" means minimal perturbation count within that supplied delay set, not a continuous minimum delay threshold.
- The model result is retrospective/static and intentionally not presented as an independent model performance measurement.
- For a stronger external claim, add blinded fixtures with unknown failure thresholds, run a fixed model API prompt and a timed human study, pre-register the delay grid/budget, and report false positives, false negatives, schedules tried, operator time, and replay rate.
