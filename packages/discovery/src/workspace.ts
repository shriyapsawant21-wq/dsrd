import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { CleanupReport, RepositoryInput, RepositorySnapshot } from "@dsrd/contracts";

export type RepositoryWorkspace = { ownershipId: string; root: string; owned: boolean; origin?: string; resolvedRevision?: string };

export async function resolveRepository(input: RepositoryInput, options: { signal: AbortSignal; acquisitionMs: number }): Promise<RepositoryWorkspace> {
  if (input.kind === "checkout") return { ownershipId: randomUUID(), root: await realpath(input.path), owned: false };
  const root = await mkdtemp(join(tmpdir(), "dsrd-repository-"));
  try {
    await git(["clone", "--no-checkout", "--", input.url, root], options);
    await git(["-C", root, "checkout", "--detach", input.ref, "--"], options);
    const revision = (await git(["-C", root, "rev-parse", "HEAD"], options)).trim();
    return { ownershipId: randomUUID(), root, owned: true, origin: sanitizeOrigin(input.url), resolvedRevision: revision };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

export async function snapshotRepository(workspace: RepositoryWorkspace, inputPaths: string[], setupPaths: string[] = []): Promise<RepositorySnapshot> {
  const paths = [...new Set([...inputPaths, ...setupPaths])].sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    const absolute = resolve(workspace.root, path);
    if (relative(workspace.root, absolute).startsWith("..")) throw new Error(`input outside workspace: ${path}`);
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error(`required snapshot input is not a file: ${path}`);
    hash.update(path); hash.update("\0"); hash.update(await readFile(absolute)); hash.update("\0");
  }
  const contentDigest = hash.digest("hex");
  return { id: `snapshot:${contentDigest.slice(0, 24)}`, origin: workspace.origin, resolvedRevision: workspace.resolvedRevision, contentDigest, inputPaths: paths };
}

export async function disposeRepository(workspace: RepositoryWorkspace): Promise<CleanupReport> {
  if (!workspace.owned) return { removed: [], remaining: [], diagnostics: [] };
  try { await rm(workspace.root, { recursive: true, force: true }); return { removed: [{ kind: "workspace", id: workspace.ownershipId }], remaining: [], diagnostics: [] }; }
  catch (error) { return { removed: [], remaining: [{ kind: "workspace", id: workspace.ownershipId }], diagnostics: [{ code: "cleanup_failed", message: error instanceof Error ? error.message : "workspace cleanup failed", path: [] }] }; }
}
function sanitizeOrigin(value: string): string { const url = new URL(value); url.username = ""; url.password = ""; return url.toString(); }
function git(args: string[], options: { signal: AbortSignal; acquisitionMs: number }): Promise<string> { return new Promise((resolveResult, reject) => { const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] }); let output = ""; let errors = ""; child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { errors += chunk; }); const timer = setTimeout(() => child.kill("SIGTERM"), options.acquisitionMs); options.signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true }); child.on("error", reject); child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolveResult(output) : reject(new Error(errors || `git exited ${code}`)); }); }); }
