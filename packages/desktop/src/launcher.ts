import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function createElectronEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...source };
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

export function launchElectron(): void {
  const require = createRequire(import.meta.url);
  const electronPath = require("electron") as string;
  const mainPath = fileURLToPath(new URL("./main.cjs", import.meta.url));
  const child = spawn(electronPath, [mainPath], {
    env: createElectronEnvironment(process.env),
    stdio: "inherit",
  });

  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) launchElectron();
