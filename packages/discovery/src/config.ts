import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { parseProjectConfig, type ProjectConfig } from "@dsrd/contracts";

export async function loadProjectConfig(path: string): Promise<ProjectConfig> {
  try { return parseProjectConfig(parse(await readFile(path, "utf8"))); }
  catch (error) {
    if (typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues)) {
      throw new Error(error.issues.map((issue) => {
        const value = issue as { path?: unknown[]; message?: unknown };
        return `${value.path?.join(".") ?? "config"}: ${String(value.message ?? "invalid value")}`;
      }).join("; "));
    }
    throw error;
  }
}
