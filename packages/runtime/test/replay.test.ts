import type { RunResult } from "@dsrd/contracts";
import { describe, expect, it } from "vitest";

import {
  DockerRuntimeController,
  type ComposeRuntime,
  type ObservationSnapshot
} from "../src/index.js";

describe("runtime replay", () => {
  it("executes the provided schedule through the ordinary runtime path", async () => {
    const starts: string[] = [];
    const compose: ComposeRuntime = {
      resetStack: async () => undefined,
      startService: async (service) => {
        starts.push(service);
      },
      collectLogs: async () => ["api | failed"],
      listServices: async () => [{ service: "api", state: "exited", exitCode: 1 }],
      stopStack: async () => undefined
    };
    const controller = new DockerRuntimeController({
      compose,
      delay: { wait: async () => undefined },
      observer: {
        evaluate: async (snapshot: ObservationSnapshot): Promise<RunResult> => ({
          scheduleId: snapshot.scheduleId,
          status: "fail",
          failureReason: "oracle-owned failure",
          events: [],
          logs: snapshot.logs
        })
      }
    });

    const result = await controller.replaySchedule({
      id: "saved-failure",
      services: { postgres: {}, api: {} }
    });

    expect(starts).toEqual(["postgres", "api"]);
    expect(result).toEqual({
      scheduleId: "saved-failure",
      status: "fail",
      failureReason: "oracle-owned failure",
      events: [],
      logs: ["api | failed"]
    });
  });
});

