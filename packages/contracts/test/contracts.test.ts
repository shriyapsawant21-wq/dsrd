import { describe, expect, it } from "vitest";

import type { RunResult } from "@dsrd/contracts";

describe("shared contracts", () => {
  it("represents healthy and classified non-healthy physical runs", () => {
    const result: RunResult = {
      scheduleId: "normal-startup",
      status: "healthy",
      events: [],
      logs: [],
    };

    expect(result).toEqual({
      scheduleId: "normal-startup",
      status: "healthy",
      events: [],
      logs: [],
    });

    const executionError: RunResult = {
      scheduleId: "unable-to-start",
      status: "execution_error",
      events: [],
      logs: [],
      diagnostics: [{ code: "compose_command_failed", message: "docker compose config failed" }],
    };

    expect(executionError.diagnostics).toEqual([
      { code: "compose_command_failed", message: "docker compose config failed" },
    ]);
  });
});
