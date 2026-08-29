import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadFailureArtifact } from "./artifact.js";
import { runCli } from "./cli.js";
import { fakeRunSchedule } from "./fake-runtime.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true })));
  directories.length = 0;
});

describe("race-debugger CLI", () => {
  it("searches with the injected runner and writes a replay artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    const output: string[] = [];

    await runCli(
      ["search", "--service", "postgres", "--output", artifactPath],
      { runSchedule: fakeRunSchedule, log: (message) => output.push(message) }
    );

    await expect(loadFailureArtifact(artifactPath)).resolves.toMatchObject({
      minimizedSchedule: {
        services: { postgres: { readinessDelayMs: 1000 } }
      }
    });
    expect(output.join("\n")).toContain("Failure found");
  });

  it("replays the saved minimized schedule through the injected runner", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dsrd-cli-"));
    directories.push(directory);
    const artifactPath = join(directory, "failure.json");
    await runCli(
      ["search", "--output", artifactPath],
      { runSchedule: fakeRunSchedule, log: () => undefined }
    );
    const output: string[] = [];

    await runCli(["replay", artifactPath], {
      runSchedule: fakeRunSchedule,
      log: (message) => output.push(message)
    });

    expect(output.join("\n")).toContain("Replay reproduced expected failure");
  });
});
