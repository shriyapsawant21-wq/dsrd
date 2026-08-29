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

  it("renders a replayable failure summary", () => {
    expect(
      renderResultSummary({
        status: "failure",
        testedSchedules: 7,
        artifactPath: "failure.json"
      })
    ).toContain("race-debugger replay failure.json");
  });
});
