import { expect, it } from "vitest";
import { RunStore } from "./run-store.js";

it("publishes progress to run subscribers", () => {
  const store = new RunStore();
  const run = store.create();
  const events: string[] = [];
  store.subscribe(run.id, (event) => events.push(event.phase));
  store.publish(run.id, { ...run.progress, phase: "exploring", percentage: 20, message: "Scanning" });
  expect(events).toEqual(["exploring"]);
  expect(store.get(run.id)?.progress.percentage).toBe(20);
});
