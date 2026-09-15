import { describe, expect, it } from "vitest";

import {
  experimentPolicySchema,
  projectConfigSchema,
  repositoryInputSchema,
  redactSecrets,
} from "@dsrd/contracts";

describe("repository onboarding schemas", () => {
  it("redacts credentials, bearer tokens, and secret assignments", () => {
    const input = "https://alice:password@example.test/api?token=abc123 Bearer top-secret PASSWORD=hunter2";
    const output = redactSecrets(input);
    expect(output).not.toContain("password");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("top-secret");
    expect(output).not.toContain("hunter2");
    expect(output).toContain("[REDACTED]");
  });

  it("rejects an embedded credential in a Git repository URL", () => {
    expect(
      repositoryInputSchema.safeParse({
        kind: "git",
        url: "https://token@host.example/repository.git",
        ref: "main",
        submodules: false,
        lfs: false,
      }).success,
    ).toBe(false);
  });

  it("rejects a zero confirmation count", () => {
    expect(experimentPolicySchema.safeParse({ baselineRuns: 0 }).success).toBe(false);
  });

  it("requires Compose launch files", () => {
    expect(
      projectConfigSchema.safeParse({
        version: 1,
        target: { id: "compose:compose.yaml", adapter: "compose", root: ".", files: [] },
      }).success,
    ).toBe(false);
  });
});
