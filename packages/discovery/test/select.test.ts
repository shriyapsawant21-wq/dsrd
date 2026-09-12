import { describe, expect, it } from "vitest";

import { selectTarget } from "../src/index.js";

const candidates = [
  { id: "compose:a.yaml", adapter: "compose" as const, root: ".", launchFiles: ["a.yaml"], requirements: [], evidence: ["a.yaml"] },
  { id: "compose:b.yaml", adapter: "compose" as const, root: ".", launchFiles: ["b.yaml"], requirements: [], evidence: ["b.yaml"] },
];

describe("selectTarget", () => {
  it("requires explicit selection for multiple candidates and honors the selected stable ID", () => {
    const inspection = { snapshotId: "snapshot", candidates, suggestions: [], truncated: false, diagnostics: [] };
    expect(selectTarget(inspection, {}).status).toBe("needs_configuration");
    expect(selectTarget(inspection, { targetId: "compose:b.yaml" })).toEqual({ status: "selected", candidate: candidates[1] });
  });
});
