import type { Workload } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import { ComposeProofObserver } from "../src/index.js";

describe("ComposeProofObserver", () => {
  it("maps Compose states and runtime schedule events into oracle timeline evidence", async () => {
    const workloads: Workload[] = [
      { id: "postgres", kind: "service", perturbablePhases: ["start"] },
      { id: "api", kind: "service", perturbablePhases: ["start"] },
    ];
    const observer = new ComposeProofObserver(() => workloads);

    const result = await observer.evaluate({
      scheduleId: "delay-postgres",
      startedAtMs: Date.now() - 10,
      logs: ['api | {"service":"api","event":"db_connection_failed","detail":"ECONNREFUSED"}'],
      services: [
        { service: "postgres", state: "running", health: "starting" },
        { service: "api", state: "exited", exitCode: 1 },
      ],
      events: [
        { timeMs: 0, service: "postgres", event: "scheduled_start_delay", detail: "3000ms" },
      ],
    });

    expect(result).toMatchObject({
      scheduleId: "delay-postgres",
      status: "fail",
      failureReason: "PostgreSQL connection was refused (api)",
    });
    expect(result.events).toEqual(expect.arrayContaining([
      { timeMs: 0, service: "postgres", event: "scheduled_start_delay", detail: "3000ms" },
      expect.objectContaining({ service: "api", event: "db_connection_failed" }),
    ]));
  });
});
