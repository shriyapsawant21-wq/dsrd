# CLI Dashboard Design

## Goal

Give DSRD a polished, immediately understandable terminal entry point while preserving its scriptable `search` and `replay` interfaces.

## Scope

The scheduler package owns the command-line interface. This change enhances its presentation and adds an interactive command chooser; it does not change shared contracts, schedule generation, runtime execution, oracle decisions, artifact format, or Docker lifecycle behavior.

## User Experience

When `race-debugger` is launched without a subcommand in an interactive terminal, it renders a concise dashboard:

- the supplied DSRD ASCII banner;
- a one-line product description: "Discover, minimize, and replay startup race conditions.";
- a three-stage explanation: Discover, Minimize, Replay;
- the supported commands and examples;
- a compact `S`earch / `R`eplay / `Q`uit chooser.

`S` launches a guided prompt sequence that supplies defaults for the existing `search` options: platform, target, delay options, and artifact output path. `R` asks for a failure-artifact path. `Q` exits successfully without running work.

Explicit invocations remain non-interactive and retain their current contract:

```bash
race-debugger search [options]
race-debugger replay <artifactPath>
```

This is essential for the golden demo, CI, and shell usage. If stdin or stdout is not interactive, bare `race-debugger` shows help rather than waiting for input.

## Architecture

`cli.ts` remains the Commander entry point and dispatches all real work through the existing `ExecutionPlatform` methods. New narrow presentation functions render dashboard, help, progress, and outcome text. A prompt adapter is injected through `CliDependencies`, making interaction deterministic in tests and avoiding direct process reads in business logic.

The interactive path converts selected answers into the same argument arrays passed to existing Commander commands. Search, replay, artifact serialization, and status interpretation therefore use the same code paths regardless of whether a user types a command or selects it from the menu.

## Output and Styling

Output uses ANSI escape sequences only when color is enabled. `CliDependencies` exposes an optional color decision; tests and redirected output use plain text. The visual palette is restrained: cyan banner, violet section labels, dim dividers, green success, yellow progress, and red failure. All important information remains readable without color.

Search logs concise live progress per candidate, followed by a failure summary that includes the minimized cause, saved artifact path, and replay command. Replay reports whether the expected failure reproduced and includes the artifact path.

## Error Handling

Invalid menu choices display a short correction and return to the chooser. An empty artifact path is rejected before replay. Commander continues to validate command options. Execution errors are reported by the existing top-level `main.ts` handler and result in a non-zero exit code. Prompt adapters close cleanly after each interactive session.

## Testing

Tests will cover:

- dashboard content in plain text, including banner and command choices;
- typed menu routing to the existing search and replay paths;
- quit behavior without platform execution;
- invalid selection recovery;
- non-interactive bare invocation displaying help without prompting;
- direct `search` and `replay` regression behavior.

No tests depend on terminal color support, Docker, or actual stdin.

## Acceptance Criteria

1. Bare interactive `race-debugger` renders the branded dashboard and accepts Search, Replay, and Quit choices.
2. Guided choices dispatch through existing search/replay behavior and shared contracts.
3. Direct `search` and `replay` commands remain automatable and pass their regression tests.
4. Redirected/non-interactive use never blocks for a prompt.
5. All project tests, type checks, and build complete successfully.
