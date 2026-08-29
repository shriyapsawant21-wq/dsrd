import { describe, expect, it } from "vitest";

import type { RunResult } from "@dsrd/contracts";

describe("shared contracts", () => {
  it("represents a passing run without a failure reason", () => {
    const result: RunResult = {
      scheduleId: "normal-startup",
      status: "pass",
      events: [],
      logs: [],
    };

    expect(result).toEqual({
      scheduleId: "normal-startup",
      status: "pass",
      events: [],
      logs: [],
    });
  });
});
