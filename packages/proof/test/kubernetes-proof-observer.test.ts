import { describe, expect, it } from "vitest";

import { KubernetesProofObserver } from "../src/index.js";

describe("KubernetesProofObserver", () => {
  it("classifies a failed Kubernetes Job through the workload oracle", async () => {
    const observer = new KubernetesProofObserver(() => [{
      id: "migrate",
      kind: "job",
      perturbablePhases: ["start"],
    }]);

    await expect(observer.evaluate({
      scheduleId: "delayed-database",
      startedAtMs: Date.now(),
      states: [{ workload: "migrate", state: "exited", exitCode: 1, observedAtMs: Date.now() }],
      logs: ["migrate: dependency unavailable"],
      events: [{ workload: "migrate", timeMs: 10, event: "job_failed" }],
    })).resolves.toMatchObject({
      scheduleId: "delayed-database",
      status: "fail",
    });
  });
});
