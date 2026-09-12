import { expect, it } from "vitest";

import { toDiscoveryRunnerResult } from "./production.js";

it("preserves a needs_configuration discovery outcome for the API run service", () => {
  expect(toDiscoveryRunnerResult({
    status: "needs_configuration",
    testedSchedules: 1,
    exploredCandidateSchedules: 0,
  })).toEqual({ status: "needs_configuration", testedSchedules: 1 });
});
