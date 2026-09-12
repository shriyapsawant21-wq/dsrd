import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { disposeRepository, resolveRepository, snapshotRepository } from "../src/index.js";
const execFile = promisify(execFileCallback); const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
describe("repository workspaces", () => {
  it("pins a Git ref and produces the same digest for a clone and checkout", async () => {
    const source = await mkdtemp(join(tmpdir(), "dsrd-source-")); roots.push(source);
    await execFile("git", ["init", source]); await execFile("git", ["-C", source, "config", "user.email", "test@example.com"]); await execFile("git", ["-C", source, "config", "user.name", "Test"]);
    await writeFile(join(source, "compose.yaml"), "services: {}\n"); await execFile("git", ["-C", source, "add", "compose.yaml"]); await execFile("git", ["-C", source, "commit", "-m", "fixture"]);
    const revision = (await execFile("git", ["-C", source, "rev-parse", "HEAD"])).stdout.trim();
    const cloned = await resolveRepository({ kind: "git", url: `file://${source}`, ref: revision, submodules: false, lfs: false }, { signal: new AbortController().signal, acquisitionMs: 10_000 });
    const checkout = await resolveRepository({ kind: "checkout", path: source }, { signal: new AbortController().signal, acquisitionMs: 10_000 });
    try { expect((await snapshotRepository(cloned, ["compose.yaml"])).contentDigest).toBe((await snapshotRepository(checkout, ["compose.yaml"])).contentDigest); expect(cloned.resolvedRevision).toBe(revision); }
    finally { expect(await disposeRepository(cloned)).toMatchObject({ remaining: [] }); }
  });
});
