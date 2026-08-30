import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const composeNames = new Set(["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]);

export type MaterializedComposeProject = {
  projectDirectory: string;
  composeFile: string;
};

export async function materializeComposeProject(
  files: Express.Multer.File[],
  relativePathsJson: unknown
): Promise<MaterializedComposeProject> {
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
    if (composeFiles.length === 0) throw new Error("No Compose file found in project folder");
    if (composeFiles.length > 1) throw new Error("Multiple Compose files found; keep one conventional Compose file");

    return { projectDirectory, composeFile: resolveSafeDestination(projectDirectory, composeFiles[0]) };
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
