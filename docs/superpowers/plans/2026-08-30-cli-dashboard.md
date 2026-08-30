# CLI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a branded DSRD terminal dashboard with a guided Search / Replay / Quit chooser while preserving Commander commands.

**Architecture:** A pure presentation module renders ANSI-optional terminal content; a prompt adapter makes interaction injectable. Bare interactive invocation maps answers into the existing Commander command paths, retaining scheduler, runtime, artifact, and oracle behavior.

**Tech Stack:** Node.js, TypeScript, Commander.js, Vitest, Node readline/promises.

**Spec:** `docs/superpowers/specs/2026-08-30-cli-dashboard-design.md`

## Global Constraints

- Preserve `race-debugger search [options]` and `race-debugger replay <artifactPath>`.
- Preserve use of the existing `ExecutionPlatform`; do not modify shared contracts.
- Prompt only when stdin and stdout are TTYs; bare non-interactive invocation shows help without blocking.
- All content remains readable when ANSI color is disabled.
- Guided workflows use the existing Commander search/replay paths.
- Tests require neither Docker nor real stdin.

---

### Task 1: Terminal presentation module

**Files:**
- Create: `packages/scheduler/src/presentation.ts`
- Create: `packages/scheduler/src/presentation.test.ts`

**Interfaces:**
- Produces: `renderDashboard(useColor: boolean): string` and `renderResultSummary(input: { status: "failure" | "no-failure" | "reproduced" | "not-reproduced"; testedSchedules?: number; artifactPath?: string }): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderDashboard, renderResultSummary } from "./presentation.js";

describe("CLI presentation", () => {
  it("renders the DSRD dashboard without ANSI styling", () => {
    const output = renderDashboard(false);
    expect(output).toContain("██████╗ ███████╗██████╗ ██████╗");
    expect(output).toContain("Discover, minimize, and replay startup race conditions.");
    expect(output).toContain("DISCOVER  →  MINIMIZE  →  REPLAY");
    expect(output).toContain("[S] Search for a race");
    expect(output).not.toContain("\u001B[");
  });

  it("renders a replayable failure summary", () => {
    expect(renderResultSummary({ status: "failure", testedSchedules: 7, artifactPath: "failure.json" }))
      .toContain("race-debugger replay failure.json");
  });
});
```

- [ ] **Step 2: Verify the test is red**

Run: `npx vitest run packages/scheduler/src/presentation.test.ts`

Expected: FAIL because `presentation.js` does not exist.

- [ ] **Step 3: Implement the minimal renderer**

```ts
export function renderDashboard(useColor: boolean): string {
  const banner = [
    "██████╗ ███████╗██████╗ ██████╗",
    "██╔══██╗██╔════╝██╔══██╗██╔══██╗",
    "██║  ██║███████╗██████╔╝██║  ██║",
    "██║  ██║╚════██║██╔══██╗██║  ██║",
    "██████╔╝███████║██║  ██║██████╔╝",
    "╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝"
  ].join("\n");
  const title = useColor ? `\u001B[96m${banner}\u001B[0m` : banner;
  return [title, "Discover, minimize, and replay startup race conditions.", "DISCOVER  →  MINIMIZE  →  REPLAY", "[S] Search for a race", "[R] Replay an artifact", "[Q] Quit"].join("\n");
}
```

Implement `renderResultSummary` using these stable phrases: `Failure found after <n> schedules.`, `Saved replay artifact: <path>`, `Replay: race-debugger replay <path>`, `Replay reproduced expected failure.`, and `Replay did not reproduce expected failure.`.

- [ ] **Step 4: Verify the test is green**

Run: `npx vitest run packages/scheduler/src/presentation.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/scheduler/src/presentation.ts packages/scheduler/src/presentation.test.ts
git commit -m "feat: add CLI dashboard presentation"
```

### Task 2: Injectable prompt and action chooser

**Files:**
- Create: `packages/scheduler/src/prompt.ts`
- Create: `packages/scheduler/src/prompt.test.ts`

**Interfaces:**
- Produces: `type PromptAdapter = { ask(message: string): Promise<string>; close(): void }`, `createReadlinePrompt(): PromptAdapter`, and `chooseMenuAction(prompt, log): Promise<"search" | "replay" | "quit">`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from "vitest";
import { chooseMenuAction, type PromptAdapter } from "./prompt.js";

it("retries after an invalid menu selection", async () => {
  const answers = ["x", "S"];
  const output: string[] = [];
  const prompt: PromptAdapter = { ask: async () => answers.shift() ?? "", close: () => undefined };
  await expect(chooseMenuAction(prompt, (message) => output.push(message))).resolves.toBe("search");
  expect(output).toContain("Choose S, R, or Q.");
});
```

- [ ] **Step 2: Verify the test is red**

Run: `npx vitest run packages/scheduler/src/prompt.test.ts`

Expected: FAIL because `prompt.js` does not exist.

- [ ] **Step 3: Implement the minimal adapter and loop**

```ts
export type PromptAdapter = { ask(message: string): Promise<string>; close(): void };

export async function chooseMenuAction(prompt: PromptAdapter, log: (message: string) => void): Promise<"search" | "replay" | "quit"> {
  while (true) {
    const answer = (await prompt.ask("Select an action [S/R/Q]: ")).trim().toLowerCase();
    if (answer === "s") return "search";
    if (answer === "r") return "replay";
    if (answer === "q") return "quit";
    log("Choose S, R, or Q.");
  }
}
```

Implement `createReadlinePrompt` with `node:readline/promises`, `process.stdin`, and `process.stdout`; `close()` closes its readline interface.

- [ ] **Step 4: Verify the test is green**

Run: `npx vitest run packages/scheduler/src/prompt.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scheduler/src/prompt.ts packages/scheduler/src/prompt.test.ts
git commit -m "feat: add interactive CLI menu chooser"
```

### Task 3: Connect interactive dashboard to Commander

**Files:**
- Modify: `packages/scheduler/src/cli.ts`
- Modify: `packages/scheduler/src/cli.test.ts`
- Modify: `packages/scheduler/src/main.ts`

**Interfaces:**
- Consumes: Task 1 renderers and Task 2 `PromptAdapter`.
- Produces: optional `CliDependencies.interactive`, `.useColor`, and `.prompt`; interactive bare `runCli([])` routes to existing search/replay commands, while non-interactive bare invocation prints help.

- [ ] **Step 1: Write the failing integration tests**

```ts
it("shows the dashboard and routes interactive Search through Commander", async () => {
  const artifactPath = join(await mkdtemp(join(tmpdir(), "dsrd-cli-")), "failure.json");
  const answers = ["s", "", "race.json", "", artifactPath];
  const output: string[] = [];
  await runCli([], { platform: fakePlatform, log: (line) => output.push(line), interactive: true, useColor: false, prompt: { ask: async () => answers.shift() ?? "", close: () => undefined } });
  expect(output.join("\n")).toContain("Discover, minimize, and replay startup race conditions.");
  await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({ version: 2 });
});

it("quits without platform execution", async () => {
  const platform = new ReceiverDependentPlatform();
  await runCli([], { platform, log: () => undefined, interactive: true, prompt: { ask: async () => "q", close: () => undefined } });
  expect(platform.runCalls).toBe(0);
  expect(platform.replayCalls).toBe(0);
});
```

- [ ] **Step 2: Verify the tests are red**

Run: `npx vitest run packages/scheduler/src/cli.test.ts`

Expected: FAIL because `CliDependencies` has no interactive prompt fields.

- [ ] **Step 3: Implement guided dispatch**

```ts
export type CliDependencies = {
  platform: ExecutionPlatform;
  log: (message: string) => void;
  interactive?: boolean;
  useColor?: boolean;
  prompt?: PromptAdapter;
};

if (args.length === 0 && dependencies.interactive) {
  dependencies.log(renderDashboard(dependencies.useColor ?? false));
  const prompt = dependencies.prompt ?? createReadlinePrompt();
  try {
    const action = await chooseMenuAction(prompt, dependencies.log);
    if (action === "quit") return;
    await runCli(await collectGuidedArgs(action, prompt, dependencies.log), { ...dependencies, prompt: undefined });
    return;
  } finally {
    prompt.close();
  }
}
```

Add `collectGuidedArgs` in `cli.ts`. Search prompts with defaults `local-process`, `race.json`, omitted delay options, and `failure.json`; replay requires a non-empty artifact path and logs `Artifact path is required.` before retrying. In `main.ts`, pass `interactive` and `useColor` based on both `process.stdin.isTTY === true` and `process.stdout.isTTY === true`. Update success logs to use Task 1 summaries without removing current stable phrases.

- [ ] **Step 4: Verify all CLI tests are green**

Run: `npx vitest run packages/scheduler/src/cli.test.ts`

Expected: PASS, including all existing direct search/replay regression tests.

- [ ] **Step 5: Commit**

```bash
git add packages/scheduler/src/cli.ts packages/scheduler/src/cli.test.ts packages/scheduler/src/main.ts
git commit -m "feat: launch CLI dashboard without a command"
```

### Task 4: Document and verify the public interface

**Files:**
- Modify: `README.md`
- Modify: `packages/scheduler/src/cli.test.ts`

**Interfaces:**
- Produces: documented interactive and scriptable launch paths.

- [ ] **Step 1: Write the failing documentation test**

```ts
it("documents the bare interactive command", async () => {
  const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
  expect(readme).toContain("Run `race-debugger` with no command");
  expect(readme).toContain("race-debugger search");
  expect(readme).toContain("race-debugger replay failure.json");
});
```

- [ ] **Step 2: Verify the test is red**

Run: `npx vitest run packages/scheduler/src/cli.test.ts`

Expected: FAIL because README does not describe bare interactive launch.

- [ ] **Step 3: Add the public usage documentation**

```markdown
### Interactive dashboard

Run `race-debugger` with no command from a terminal to open the DSRD dashboard and choose Search, Replay, or Quit.

### Scriptable commands

```bash
race-debugger search
race-debugger replay failure.json
```
```

- [ ] **Step 4: Verify the final behavior**

Run: `npm test`

Expected: PASS with no failures.

Run: `npm run typecheck`

Expected: all workspaces exit 0.

Run: `npm run build`

Expected: all workspaces exit 0 and `packages/scheduler/dist/main.js` exists.

Run: `node packages/scheduler/dist/main.js --help`

Expected: exit 0 and output includes `search` and `replay`.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/scheduler/src/cli.test.ts
git commit -m "docs: describe CLI dashboard usage"
```

## Plan Self-Review

- Spec coverage: Task 1 covers dashboard text and color fallback; Task 2 covers prompts and invalid input; Task 3 covers interactive routing, non-interactive safety, and direct-command preservation; Task 4 covers documentation and production verification.
- Placeholder scan: no unfinished markers, vague error-handling directions, or deferred requirements are present.
- Type consistency: Task 2 defines `PromptAdapter`; Task 3 adds it to `CliDependencies`; Task 1 rendering exports are consumed only by Task 3.
