import { describe, expect, it } from "vitest";

import {
  DockerCommandError,
  DockerComposeClient,
  type CommandInvocation,
  type CommandResult,
  type CommandRunner
} from "../src/index.js";

class RecordingRunner implements CommandRunner {
  readonly calls: CommandInvocation[] = [];

  constructor(private readonly result: CommandResult = { stdout: "", stderr: "", exitCode: 0 }) {}

  async run(invocation: CommandInvocation): Promise<CommandResult> {
    this.calls.push(invocation);
    return this.result;
  }
}

describe("DockerComposeClient lifecycle", () => {
  it("stops the stack without deleting volumes", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    await client.stopStack();

    expect(runner.calls).toEqual([
      {
        command: "docker",
        args: ["compose", "down", "--remove-orphans"],
        cwd: "C:/fixture"
      }
    ]);
  });

  it("resets the stack by removing volumes and orphan containers", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    await client.resetStack();

    expect(runner.calls[0]?.args).toEqual([
      "compose",
      "down",
      "--volumes",
      "--remove-orphans"
    ]);
  });

  it("includes a configured compose file in every command", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({
      projectDirectory: "C:/fixture",
      composeFile: "compose.demo.yml",
      runner
    });

    await client.stopStack();

    expect(runner.calls[0]?.args).toEqual([
      "compose",
      "-f",
      "compose.demo.yml",
      "down",
      "--remove-orphans"
    ]);
  });

  it("starts exactly one requested service in detached mode", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    await client.startService("api");

    expect(runner.calls[0]?.args).toEqual(["compose", "up", "-d", "api"]);
  });

  it("starts a controlled service without auto-starting its dependencies", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    await client.startService("api", { includeDependencies: false });

    expect(runner.calls[0]?.args).toEqual(["compose", "up", "-d", "--no-deps", "api"]);
  });

  it("forwards a start cancellation signal to the command runner", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });
    const controller = new AbortController();

    await client.startService("api", { signal: controller.signal });

    expect(runner.calls[0]?.signal).toBe(controller.signal);
  });

  it("rejects unsafe service names before invoking Docker", async () => {
    const runner = new RecordingRunner();
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    await expect(client.startService("api; rm -rf /")).rejects.toThrow(
      "Invalid Compose service name"
    );
    expect(runner.calls).toEqual([]);
  });

  it("retains Docker evidence when a command exits non-zero", async () => {
    const runner = new RecordingRunner({
      stdout: "partial output",
      stderr: "daemon unavailable",
      exitCode: 17
    });
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    const failure = await client.stopStack().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DockerCommandError);
    expect(failure).toMatchObject({
      command: "docker",
      args: ["compose", "down", "--remove-orphans"],
      stdout: "partial output",
      stderr: "daemon unavailable",
      exitCode: 17
    });
  });

  it("collects non-empty Compose log lines without ANSI color", async () => {
    const runner = new RecordingRunner({
      stdout: "api | starting\r\npostgres | ready\r\n\r\n",
      stderr: "",
      exitCode: 0
    });
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    const logs = await client.collectLogs();

    expect(logs).toEqual(["api | starting", "postgres | ready"]);
    expect(runner.calls[0]?.args).toEqual(["compose", "logs", "--no-color"]);
  });

  it("parses Compose service metadata from JSON arrays", async () => {
    const runner = new RecordingRunner({
      stdout: JSON.stringify([
        { Service: "api", State: "running", ExitCode: 0, Health: "healthy" },
        { Service: "worker", State: "exited", ExitCode: 1, Health: "" }
      ]),
      stderr: "",
      exitCode: 0
    });
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    const services = await client.listServices();

    expect(services).toEqual([
      { service: "api", state: "running", exitCode: 0, health: "healthy" },
      { service: "worker", state: "exited", exitCode: 1 }
    ]);
    expect(runner.calls[0]?.args).toEqual(["compose", "ps", "--all", "--format", "json"]);
  });

  it("parses Compose service metadata from JSON lines", async () => {
    const runner = new RecordingRunner({
      stdout:
        '{"Service":"api","State":"running","ExitCode":0}\n' +
        '{"Service":"worker","State":"exited","ExitCode":2}\n',
      stderr: "",
      exitCode: 0
    });
    const client = new DockerComposeClient({ projectDirectory: "C:/fixture", runner });

    await expect(client.listServices()).resolves.toEqual([
      { service: "api", state: "running", exitCode: 0 },
      { service: "worker", state: "exited", exitCode: 2 }
    ]);
  });
});
