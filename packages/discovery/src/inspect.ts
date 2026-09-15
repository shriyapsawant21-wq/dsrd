import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import type { InspectionResult, RunDiagnostic, TargetCandidate } from "@dsrd/contracts";

const excluded = new Set([".git", ".worktrees", "worktrees", "node_modules", ".venv", "venv", "dist", "build", "target", "artifacts"]);
const composeNames = new Set(["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]);
const maxMetadataBytes = 1024 * 1024;

export type ScanOptions = { maxDepth?: number; maxEntries?: number };

export async function inspectRepository(root: string, options: ScanOptions = {}): Promise<InspectionResult> {
  const absoluteRoot = await realpath(root);
  const candidates: TargetCandidate[] = [];
  const suggestions: string[] = [];
  const diagnostics: RunDiagnostic[] = [];
  const maxDepth = options.maxDepth ?? 8;
  const maxEntries = options.maxEntries ?? 20_000;
  let entries = 0;
  let truncated = false;

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth || truncated) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      if (++entries > maxEntries) { truncated = true; diagnostics.push({ code: "scan_truncated", message: `scan exceeded ${maxEntries} entries`, path: [] }); return; }
      const path = resolve(directory, entry.name);
      const relativePath = relative(absoluteRoot, path).replaceAll("\\", "/");
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) {
        try { if (!relative(absoluteRoot, await realpath(path)).startsWith("..")) continue; } catch { /* broken links are ignored */ }
        diagnostics.push({ code: "symlink_outside_root", message: "symlink outside selected root ignored", path: [relativePath] });
        continue;
      }
      if (stat.isDirectory()) { await visit(path, depth + 1); continue; }
      if (!stat.isFile()) continue;
      const rootPath = dirname(relativePath) === "." ? "." : dirname(relativePath);
      if (composeNames.has(entry.name.toLowerCase())) candidates.push({ id: `compose:${relativePath}`, adapter: "compose", root: rootPath, launchFiles: [relativePath], requirements: [], evidence: [relativePath] });
      else if (entry.name === "manifest.json" && await isLocalManifest(path, stat.size)) candidates.push({ id: `local-process:${relativePath}`, adapter: "local-process", root: rootPath, launchFiles: [relativePath], requirements: ["explicit readiness and reset policy"], evidence: [relativePath] });
      else if (/\.(yaml|yml)$/i.test(entry.name) && await isKubernetesManifest(path, stat.size)) candidates.push({ id: `kubernetes:${relativePath}`, adapter: "kubernetes", root: rootPath, launchFiles: [relativePath], requirements: ["Kubernetes execution adapter capability"], evidence: [relativePath] });
      else if (entry.name === "package.json") suggestions.push("package.json: launch commands require explicit configuration");
    }
  }
  await visit(absoluteRoot, 0);
  candidates.sort((left, right) => left.id.localeCompare(right.id));
  return { snapshotId: createHash("sha256").update(absoluteRoot).digest("hex").slice(0, 32), candidates, suggestions: [...new Set(suggestions)].sort(), truncated, diagnostics };
}

async function isLocalManifest(path: string, size: number): Promise<boolean> {
  if (size > maxMetadataBytes) return false;
  try { const value: unknown = JSON.parse(await readFile(path, "utf8")); return typeof value === "object" && value !== null && Array.isArray((value as { workloads?: unknown }).workloads) && (value as { workloads: unknown[] }).workloads.every((workload) => typeof workload === "object" && workload !== null && typeof (workload as { id?: unknown }).id === "string" && Array.isArray((workload as { command?: unknown }).command)); } catch { return false; }
}
async function isKubernetesManifest(path: string, size: number): Promise<boolean> {
  if (size > maxMetadataBytes) return false;
  try { const content = await readFile(path, "utf8"); return /^apiVersion:\s*\S+/m.test(content) && /^kind:\s*(Deployment|StatefulSet|Job|DaemonSet|Pod)\b/m.test(content); } catch { return false; }
}
