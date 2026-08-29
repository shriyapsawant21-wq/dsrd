import { describe, expect, it } from "vitest";

import { renderDashboard, renderResultSummary } from "./presentation.js";

describe("CLI presentation", () => {
  it("renders the DSRD dashboard without ANSI styling", () => {
    const output = renderDashboard(false);

    expect(output).toContain("██████╗ ███████╗██████╗ ██████╗");
    expect(output).toContain("Discover, minimize, and replay startup race conditions.");
    expect(output).toContain("DISCOVER  →  MINIMIZE  →  REPLAY");
    expect(output).toContain("[S] Search for a race");
    expect(output).toContain("[R] Replay an artifact");
    expect(output).toContain("[Q] Quit");
    expect(output).not.toContain("\u001B[");
  });

  it("renders the DSRD banner in hot pink when color is enabled", () => {
    expect(renderDashboard(true)).toContain("\u001B[38;2;255;105;180m");
  });

  it("renders a replayable failure summary", () => {
    expect(
      renderResultSummary({
        status: "failure",
        testedSchedules: 7,
        artifactPath: "failure.json"
      })
    ).toContain("Replay (PowerShell): race-debugger replay 'failure.json'");
    expect(
      renderResultSummary({
        status: "failure",
        testedSchedules: 7,
        artifactPath: "failure.json"
      })
    ).toContain("Replay (POSIX): race-debugger replay 'failure.json'");
  });

  it("renders shell-safe replay commands for PowerShell and POSIX", () => {
    const output = renderResultSummary({
      status: "failure",
      testedSchedules: 1,
      artifactPath: "artifacts/it's $risky; file.json"
    });

    expect(output).toContain("Replay (PowerShell): race-debugger replay 'artifacts/it''s $risky; file.json'");
    expect(output).toContain("Replay (POSIX): race-debugger replay 'artifacts/it'\"'\"'s $risky; file.json'");
  });
});
