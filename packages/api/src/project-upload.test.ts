import { afterEach, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { materializeComposeProject } from "./project-upload.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function uploadedFile(contents: string): Express.Multer.File {
  return { buffer: Buffer.from(contents) } as Express.Multer.File;
}

it("materializes a Compose project while preserving relative build files", async () => {
  const project = await materializeComposeProject(
    [uploadedFile("services: { api: { build: . } }"), uploadedFile("FROM node:20-alpine")],
    JSON.stringify(["demo/compose.yaml", "demo/Dockerfile"])
  );
  createdDirectories.push(project.projectDirectory);

  expect(project.composeFile).toMatch(/demo[\\/]compose\.yaml$/);
  await expect(readFile(project.composeFile, "utf8")).resolves.toContain("build: .");
});

it("rejects traversal paths", async () => {
  await expect(
    materializeComposeProject([uploadedFile("services: {}")], JSON.stringify(["../compose.yaml"]))
  ).rejects.toThrow("Invalid project file path");
});

it("rejects duplicate project paths", async () => {
  await expect(
    materializeComposeProject(
      [uploadedFile("services: {}"), uploadedFile("duplicate")],
      JSON.stringify(["compose.yaml", "compose.yaml"])
    )
  ).rejects.toThrow("Duplicate project file path");
});

it("rejects a project without a conventional Compose file", async () => {
  await expect(
    materializeComposeProject([uploadedFile("FROM node:20-alpine")], JSON.stringify(["Dockerfile"]))
  ).rejects.toThrow("No Compose file found");
});
