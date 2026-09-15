import { describe, expect, it } from "vitest";

import { projectConfigSchema } from "@dsrd/contracts";

describe("project configuration schema", () => {
  it("preserves valid zero delay options while rejecting unknown workload dependencies", () => {
    const parsed = projectConfigSchema.safeParse({
      version: 1,
      target: { id: "process:app", adapter: "local-process", root: "." },
      workloads: {
        api: {
          kind: "service",
          command: ["node", "server.js"],
          readiness: {
            id: "api-ready",
            type: "http",
            url: "http://127.0.0.1:3000/health",
            observer: "host",
            expectedStatus: 200,
          },
          dependsOn: [{ workloadId: "missing", condition: "service_healthy" }],
        },
      },
      state: { policy: "fresh-owned" },
      experiment: { delayOptionsMs: [0, 500] },
    });

    expect(parsed.success).toBe(false);
  });
});
