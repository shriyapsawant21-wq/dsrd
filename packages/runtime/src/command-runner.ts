import { spawn } from "node:child_process";

export type CommandInvocation = {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export interface CommandRunner {
  run(invocation: CommandInvocation): Promise<CommandResult>;
}

export class NodeCommandRunner implements CommandRunner {
  run(invocation: CommandInvocation): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        shell: false,
        windowsHide: true,
        signal: invocation.signal,
      });
      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
      });
    });
  }
}
