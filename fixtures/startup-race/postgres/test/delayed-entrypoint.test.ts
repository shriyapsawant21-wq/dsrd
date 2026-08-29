import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
const wrapper = fileURLToPath(
  new URL("../delayed-entrypoint.sh", import.meta.url),
);

type ScriptResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  elapsedMs: number;
};

async function runWrapper(delay: string): Promise<ScriptResult> {
  const startedAt = performance.now();
  const child = spawn(bash, [wrapper, "postgres"], {
    env: {
      ...process.env,
      POSTGRES_START_DELAY_MS: delay,
      POSTGRES_ORIGINAL_ENTRYPOINT: "echo",
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));

  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  return {
    code,
    stdout,
    stderr,
    elapsedMs: performance.now() - startedAt,
  };
}

describe("PostgreSQL delayed entrypoint", () => {
  it("delegates immediately when the delay is zero", async () => {
    const result = await runWrapper("0");

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("postgres");
  });

  it("waits for the configured millisecond delay before delegating", async () => {
    const result = await runWrapper("100");

    expect(result.code).toBe(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(80);
    expect(result.stdout).toContain('"event":"startup_delay_applied"');
    expect(result.stdout.trimEnd()).toMatch(/postgres$/);
  });

  it("rejects a non-numeric delay without delegating", async () => {
    const result = await runWrapper("abc");

    expect(result.code).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "POSTGRES_START_DELAY_MS must be a non-negative integer",
    );
  });
});
