import { expect, it } from "vitest";
import { RunService } from "./run-service.js";
import { RunStore } from "./run-store.js";

it("marks a successful discovery complete", async () => {
  const store = new RunStore(); const run = store.create();
  const service = new RunService(store, async (_file, onProgress) => {
    onProgress(3, 6);
    return { status: "completed" as const, testedSchedules: 3 };
  });
  await service.start(run.id, "compose.yaml");
  expect(store.get(run.id)?.progress.phase).toBe("completed");
  expect(store.get(run.id)?.progress.testedSchedules).toBe(3);
});
