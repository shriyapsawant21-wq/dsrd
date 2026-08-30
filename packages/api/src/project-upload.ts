import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { TargetConfig } from "@dsrd/contracts";

const composeNames = new Set(["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]);

export type MaterializedProject = {
  projectDirectory: string;
  target: TargetConfig;
};

export async function materializeProject(
  files: Express.Multer.File[],
  relativePathsJson: unknown,
  requestedPlatform?: unknown
): Promise<MaterializedProject> {
  const relativePaths = parseRelativePaths(relativePathsJson, files.length);
  const projectDirectory = await mkdtemp(join(tmpdir(), "dsrd-web-run-"));

  try {
    const destinations = new Set<string>();
    for (const [index, relativePath] of relativePaths.entries()) {
      const destination = resolveSafeDestination(projectDirectory, relativePath);
      if (destinations.has(destination)) throw new Error("Duplicate project file path");
      destinations.add(destination);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, files[index].buffer);
    }

    const composeFiles = relativePaths.filter((path) => composeNames.has(basename(path)));
    const manifestFiles = relativePaths.filter((path) => basename(path) === "manifest.json");
    if (composeFiles.length + manifestFiles.length === 0) throw new Error("No supported project target found");
    if (composeFiles.length > 1 || manifestFiles.length > 1 || (composeFiles.length > 0 && manifestFiles.length > 0 && requestedPlatform === undefined)) {
      throw new Error("Multiple project targets found; keep one Compose file or one manifest.json");
    }
    if (requestedPlatform !== undefined && requestedPlatform !== "compose" && requestedPlatform !== "local-process") throw new Error("Invalid project target selection");
    if (requestedPlatform === "compose" && composeFiles.length !== 1) throw new Error("No Compose file found in project folder");
    if (requestedPlatform === "local-process" && manifestFiles.length !== 1) throw new Error("No manifest.json found in project folder");
    const target: TargetConfig = (requestedPlatform === "compose" || (requestedPlatform === undefined && composeFiles.length === 1))
      ? { platform: "compose", composeFile: resolveSafeDestination(projectDirectory, composeFiles[0]) }
      : { platform: "local-process", manifestPath: resolveSafeDestination(projectDirectory, manifestFiles[0]) };
    return { projectDirectory, target };
  } catch (error) {
    await rm(projectDirectory, { recursive: true, force: true });
    throw error;
  }
}

function parseRelativePaths(value: unknown, fileCount: number): string[] {
  if (typeof value !== "string") throw new Error("Project file paths are required");
  let paths: unknown;
  try {
    paths = JSON.parse(value);
  } catch {
    throw new Error("Project file paths are invalid");
  }
  if (!Array.isArray(paths) || paths.length !== fileCount || paths.some((path) => typeof path !== "string")) {
    throw new Error("Project file paths must match uploaded files");
  }
  return paths;
}

function resolveSafeDestination(projectDirectory: string, inputPath: string): string {
  const portablePath = inputPath.replaceAll("\\", "/");
  const components = portablePath.split("/");
  if (
    !portablePath ||
    isAbsolute(portablePath) ||
    components.some((component) => component === "" || component === "." || component === ".." || component.includes("\0"))
  ) {
    throw new Error("Invalid project file path");
  }

  const destination = resolve(projectDirectory, ...components);
  const insideProject = relative(projectDirectory, destination);
  if (!insideProject || insideProject.startsWith("..") || isAbsolute(insideProject)) throw new Error("Invalid project file path");
  return destination;
}
