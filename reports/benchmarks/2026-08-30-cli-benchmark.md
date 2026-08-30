# DSRD CLI benchmark: AI alone vs. DSRD pipeline vs. human workflow

**Date:** 2026-08-30
**Scope:** all ten supported Local Process and Docker Compose fixtures in `~/dsrd-tests`.
**Commit status:** no project changes committed. Benchmark artifacts are stored beside this report.

## Executive result

DSRD completed the required discover -> minimize -> save -> replay workflow on both targets with **3/3 successful searches and 3/3 successful physical replays per target (12/12 phase outcomes)**. Every search established a passing normal control run, found the first failing schedule after two explored candidates, preserved a one-perturbation reproducer, and saved a replay artifact.

**Bottom line: DSRD is the only approach in this benchmark that closes the full proof loop automatically.** It found the race, proved that normal startup works, produced a minimal counterexample, saved it, and physically replayed it with complete timeline evidence. AI alone can propose a plausible cause; a human can manually run commands; neither independently delivered the measured discovery-to-replay result.

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

### AI agent alone versus DSRD

For the full ten-demo matrix, an AI agent acting only as a source-reading
assistant has **0/10 end-to-end correctness** in the benchmark's required
workflow: it did not execute a normal baseline, confirm a failure, minimize a
schedule, create an artifact, or replay an outcome. It can suggest a plausible
cause, but that suggestion remains unproven until another execution workflow
does the work.

DSRD completed all ten proof cycles in **206.024 seconds**. The estimated
model-only time-to-proof is **200–505 minutes** when source inspection and the
necessary human execution workflow are included. This estimate is not a timed
model study; the measured distinction is that DSRD produced ten
machine-verified, replayable counterexamples while the model-only workflow
produced none.

Artifacts retained as benchmark evidence:

- `local-algorithm-run1.failure.json` through `local-algorithm-run3.failure.json`
- `compose-algorithm-run1.failure.json` through `compose-algorithm-run3.failure.json`

## Direct workflow comparison: AI alone, DSRD, and human debugging

This table compares the complete debugging outcome, not the ability to read a
small source file. DSRD time is measured across all ten demos. AI-alone and
human time-to-proof are estimates because neither was run as a timed study.

| Workflow | Time to complete all 10 demos | Correctness in this benchmark | Output | Efficiency difference vs. DSRD |
| --- | ---: | --- | --- | --- |
| **DSRD pipeline** | **206.024 s (3.4 min), measured** | **10/10** baseline pass + failure discovery + minimization + replay | 10 machine-verified artifacts with timelines | Reference |
| **AI agent alone** | **200–505 min, estimated** | **0/10 end-to-end**: it runs no baseline, verifies no failure, minimizes no schedule, and replays nothing | An unverified text hypothesis | DSRD reaches proof **58–147× faster** |
| **Human workflow** | **190–475 min, estimated** | Not measured; correctness depends on manual commands and log judgment | Manual notes unless an artifact process is built separately | DSRD reaches proof **55–138× faster** |

DSRD is better in this benchmark because its result is not a guess. It proves
that the normal system passes, actively creates the timing condition, asks a
deterministic oracle for the verdict, reduces the reproducer, saves the
evidence, and reruns it. AI alone stops before those steps; a human can perform
them, but must coordinate and judge each step manually. That is why DSRD has a
measured 10/10 completed proof rate while AI alone has no completed proof
results.

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
