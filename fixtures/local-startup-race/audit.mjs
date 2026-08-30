import { access } from "node:fs/promises";

await new Promise((resolve) => setTimeout(resolve, 200));
try {
  await access(new URL("./state/api-ready", import.meta.url));
  console.log("audit complete");
} catch {
  console.error("STARTUP_RACE api is not ready");
  process.exitCode = 1;
}
