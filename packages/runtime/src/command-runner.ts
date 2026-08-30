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
  run(invocation: CommandInvocation, signal?: AbortSignal): Promise<CommandResult>;
}

export class NodeCommandRunner implements CommandRunner {
  run(invocation: CommandInvocation, signal?: AbortSignal): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        shell: false,
        windowsHide: true,
        signal: invocation.signal,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => {
        child.kill();
        finish(() => reject(signal?.reason ?? new Error("Command aborted")));
      };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", (error) => finish(() => reject(error)));
      child.once("close", (exitCode) => {
        finish(() => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
      });
      if (signal?.aborted) {
        abort();
      } else {
        signal?.addEventListener("abort", abort, { once: true });
      }
    });
  }
}
