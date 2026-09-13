import { redactSecrets } from "@dsrd/contracts";
import type {
  CommandInvocation,
  CommandResult,
  CommandRunner
} from "./command-runner.js";
import type { ComposeServiceState } from "./observer.js";

export type DockerComposeClientOptions = {
  projectDirectory: string;
  composeFile?: string;
  /** Names the exact Compose resources that this runtime attempt owns. */
  projectName?: string;
  runner: CommandRunner;
};

export class DockerCommandError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;

  constructor(invocation: CommandInvocation, result: CommandResult) {
    super(`Docker command failed with exit code ${result.exitCode}`);
    this.name = "DockerCommandError";
    this.command = invocation.command;
    this.args = invocation.args;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.exitCode = result.exitCode;
  }
}

export class DockerComposeClient {
  constructor(private readonly options: DockerComposeClientOptions) {
    if (options.projectName !== undefined && !/^[a-z0-9][a-z0-9_-]*$/.test(options.projectName)) {
      throw new Error(`Invalid Compose project name: ${options.projectName}`);
    }
  }

  /**
   * Performs target validation and expensive image acquisition outside the
   * startup/readiness observation window.  A later `up` is deliberately
   * forbidden from building or pulling.
   */
  async prepare(signal?: AbortSignal): Promise<void> {
    await this.runCompose(["config", "--quiet"], signal);
    await this.runCompose(["pull", "--ignore-buildable"], signal);
    await this.runCompose(["build"], signal);
  }

  async stopStack(): Promise<void> {
    await this.runCompose(["down", "--remove-orphans"]);
  }

  async resetStack(): Promise<void> {
    await this.runCompose(["down", "--volumes", "--remove-orphans"]);
  }

  async startService(
    service: string,
    options: { includeDependencies?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(service)) {
      throw new Error(`Invalid Compose service name: ${service}`);
    }

    await this.runCompose(
      [
        "up",
        "-d",
        "--no-build",
        "--pull",
        "never",
        ...(options.includeDependencies === false ? ["--no-deps"] : []),
        service,
      ],
      options.signal,
    );
  }

  async startServices(
    services: string[],
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    if (services.length === 0) return;
    for (const service of services) {
      this.assertServiceName(service);
    }
    await this.runCompose(
      ["up", "-d", "--no-build", "--pull", "never", ...services],
      options.signal,
    );
  }

  async collectLogs(signal?: AbortSignal): Promise<string[]> {
    const result = await this.runCompose(["logs", "--no-color"], signal);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => redactSecrets(line.trimEnd()))
      .filter((line) => line.length > 0);
  }

  async listServices(signal?: AbortSignal): Promise<ComposeServiceState[]> {
    const result = await this.runCompose(["ps", "--all", "--format", "json"], signal);
    const output = result.stdout.trim();
    if (output.length === 0) {
      return [];
    }

    const parsed = this.parseServiceRows(output);
    return parsed.map((row) => ({
      service: String(row.Service),
      state: String(row.State),
      ...(typeof row.ExitCode === "number" ? { exitCode: row.ExitCode } : {}),
      ...(typeof row.Health === "string" && row.Health.length > 0
        ? { health: row.Health }
        : {})
    }));
  }

  private async runCompose(args: string[], signal?: AbortSignal): Promise<CommandResult> {
    const invocation: CommandInvocation = {
      command: "docker",
      args: [
        "compose",
        ...(this.options.projectName === undefined ? [] : ["-p", this.options.projectName]),
        ...(this.options.composeFile === undefined
          ? []
          : ["-f", this.options.composeFile]),
        ...args
      ],
      cwd: this.options.projectDirectory,
      ...(signal === undefined ? {} : { signal }),
    };
    const result = await this.options.runner.run(invocation);
    if (result.exitCode !== 0) {
      throw new DockerCommandError(invocation, result);
    }
    return result;
  }

  private parseServiceRows(output: string): Array<Record<string, unknown>> {
    try {
      const value: unknown = JSON.parse(output);
      if (Array.isArray(value)) {
        return value as Array<Record<string, unknown>>;
      }
      return [value as Record<string, unknown>];
    } catch {
      return output.split(/\r?\n/).map((line) => {
        const value: unknown = JSON.parse(line);
        return value as Record<string, unknown>;
      });
    }
  }

  private assertServiceName(service: string): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(service)) {
      throw new Error(`Invalid Compose service name: ${service}`);
    }
  }
}
