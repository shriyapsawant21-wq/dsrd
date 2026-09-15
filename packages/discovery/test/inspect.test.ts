import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectRepository } from "../src/index.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(async (directory) => (await import("node:fs/promises")).rm(directory, { recursive: true, force: true }))); });

describe("inspectRepository", () => {
  it("reports independent Compose, configured process, and Kubernetes candidates without executing metadata scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsrd-inspect-"));
    directories.push(root);
    await mkdir(join(root, "apps", "process"), { recursive: true });
    await mkdir(join(root, "k8s"), { recursive: true });
    await writeFile(join(root, "compose.yaml"), "services: {}\n");
    await writeFile(join(root, "apps", "process", "manifest.json"), JSON.stringify({ workloads: [{ id: "api", kind: "service", perturbablePhases: ["start"], command: ["node", "server.js"] }] }));
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { postinstall: "touch SHOULD_NOT_RUN" } }));
    await writeFile(join(root, "k8s", "deployment.yaml"), "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\n");

    const result = await inspectRepository(root);

    expect(result.candidates.map(({ id }) => id)).toEqual(["compose:compose.yaml", "kubernetes:k8s/deployment.yaml", "local-process:apps/process/manifest.json"]);
    expect(result.suggestions).toContain("package.json: launch commands require explicit configuration");
    await expect((await import("node:fs/promises")).access(join(root, "SHOULD_NOT_RUN"))).rejects.toThrow();
  });

  it("does not follow a symlink outside the selected checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsrd-inspect-"));
    const outside = await mkdtemp(join(tmpdir(), "dsrd-outside-"));
    directories.push(root, outside);
    await writeFile(join(outside, "compose.yaml"), "services: {}\n");
    await symlink(outside, join(root, "escape"));

    const result = await inspectRepository(root);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "symlink_outside_root" }));
  });
});
