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
  expect(store.get(run.id)?.progress.failureCount).toBe(1);
});

it("preserves an explicit configuration outcome from shared orchestration", async () => {
  const store = new RunStore(); const run = store.create();
  const service = new RunService(store, async () => ({ status: "needs_configuration" as const, testedSchedules: 1 }));

  await service.start(run.id, { platform: "local-process", manifestPath: "race.json" });

  expect(store.get(run.id)?.progress).toMatchObject({
    phase: "needs_configuration",
    testedSchedules: 1,
    failureCount: 0,
  });
});
