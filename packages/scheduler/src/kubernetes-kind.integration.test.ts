import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { createDefaultPlatform } from "./default-platform.js";
import { discoverFailure, replayFailure } from "./orchestrator.js";
import { generateCandidates } from "./candidates.js";

const enabled = process.env.KUBERNETES_C7_INTEGRATION === "1";
const target = {
  platform: "kubernetes" as const,
  manifestPath: fileURLToPath(new URL("../../../fixtures/kubernetes-startup-race/manifest.yaml", import.meta.url)),
  namespace: "dsrd-kubernetes-race",
};

describe.skipIf(!enabled)("Kind Kubernetes platform", () => {
  afterEach(async () => {
    await createDefaultPlatform().reset(target);
  }, 120_000);
  it("discovers the fixture workloads through the concrete default platform", async () => {
    const platform = createDefaultPlatform();
    await expect(platform.discover(target)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "api", kind: "service" }),
      expect.objectContaining({ id: "database", kind: "service" }),
      expect.objectContaining({ id: "migrate", kind: "job" }),
    ]));
  });

  it("searches, minimizes, saves target evidence, and replays a Kubernetes failure", async () => {
    const platform = createDefaultPlatform();
    const workloads = await platform.discover(target);
    const candidates = generateCandidates(workloads, [0, 1_500]);
    const result = await discoverFailure({
      target,
      candidates,
      delayOptionsMs: [0, 1_500],
      runSchedule: platform.run.bind(platform),
    });
    expect(result.status).toBe("found_failure");
    if (result.status === "found_failure") {
      expect(result.artifact.target).toEqual(target);
      await expect(replayFailure(result.artifact, platform.replay.bind(platform))).resolves.toMatchObject({ status: "reproduced" });
    }
  }, 120_000);
});
