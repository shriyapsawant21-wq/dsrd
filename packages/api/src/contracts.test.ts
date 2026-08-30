import { expect, it } from "vitest";

import { initialProgress } from "./contracts.js";

it("defines frontend progress events", () => {
  expect(initialProgress("run-1")).toEqual({
    runId: "run-1",
    phase: "queued",
    percentage: 0,
    message: "Run queued",
    testedSchedules: 0,
    failureCount: 0
  });
});
