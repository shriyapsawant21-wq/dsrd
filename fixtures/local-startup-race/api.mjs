import { access, mkdir, writeFile } from "node:fs/promises";

await new Promise((resolve) => setTimeout(resolve, 50));
try {
  await access(new URL("./state/bootstrap-ready", import.meta.url));
  await mkdir(new URL("./state", import.meta.url), { recursive: true });
  await writeFile(new URL("./state/api-ready", import.meta.url), "ready");
  console.log("api ready");
  setInterval(() => undefined, 1_000);
} catch {
  console.error("STARTUP_RACE bootstrap is not ready");
  process.exitCode = 1;
}
