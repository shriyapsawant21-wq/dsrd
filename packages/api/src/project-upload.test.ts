import { afterEach, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { materializeProject } from "./project-upload.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function uploadedFile(contents: string): Express.Multer.File {
  return { buffer: Buffer.from(contents) } as Express.Multer.File;
}

it("materializes a Compose project while preserving relative build files", async () => {
  const project = await materializeProject(
    [uploadedFile("services: { api: { build: . } }"), uploadedFile("FROM node:20-alpine")],
    JSON.stringify(["demo/compose.yaml", "demo/Dockerfile"])
  );
  createdDirectories.push(project.projectDirectory);

  expect(project.target).toMatchObject({ platform: "compose", composeFile: expect.stringMatching(/demo[\\/]compose\.yaml$/) });
  await expect(readFile(project.target.composeFile, "utf8")).resolves.toContain("build: .");
});

it("rejects traversal paths", async () => {
  await expect(
    materializeProject([uploadedFile("services: {}")], JSON.stringify(["../compose.yaml"]))
  ).rejects.toThrow("Invalid project file path");
});

it("rejects duplicate project paths", async () => {
  await expect(
    materializeProject(
      [uploadedFile("services: {}"), uploadedFile("duplicate")],
      JSON.stringify(["compose.yaml", "compose.yaml"])
    )
  ).rejects.toThrow("Duplicate project file path");
});

it("rejects a project without a conventional Compose file", async () => {
  await expect(
    materializeProject([uploadedFile("FROM node:20-alpine")], JSON.stringify(["Dockerfile"]))
  ).rejects.toThrow("No supported project target found");
});

it("materializes a local-process project", async () => {
  const project = await materializeProject(
    [uploadedFile('{"workloads": []}')],
    JSON.stringify(["race/manifest.json"])
  );
  createdDirectories.push(project.projectDirectory);

  expect(project.target).toMatchObject({ platform: "local-process", manifestPath: expect.stringMatching(/race[\\/]manifest\.json$/) });
});

it("rejects folders with both Compose and local-process targets", async () => {
  await expect(
    materializeProject(
      [uploadedFile("services: {}"), uploadedFile('{"workloads": []}')],
      JSON.stringify(["compose.yaml", "manifest.json"])
    )
  ).rejects.toThrow("Multiple project targets found");
});

it("uses the requested local target when a folder contains both target files", async () => {
  const project = await materializeProject(
    [uploadedFile("services: {}"), uploadedFile('{"workloads": []}')],
    JSON.stringify(["compose.yaml", "manifest.json"]),
    "local-process"
  );
  createdDirectories.push(project.projectDirectory);
  expect(project.target).toMatchObject({ platform: "local-process", manifestPath: expect.stringMatching(/manifest\.json$/) });
});
