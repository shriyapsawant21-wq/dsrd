import { runCli } from "./cli.js";
import { fakePlatform } from "./fake-platform.js";

const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;

runCli(process.argv.slice(2), {
  platform: fakePlatform,
  log: console.log,
  interactive,
  useColor: interactive
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
