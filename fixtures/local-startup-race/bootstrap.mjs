import { mkdir, writeFile } from "node:fs/promises";

const delayMs = Number(process.env.DSRD_READY_DELAY_MS ?? "0");
if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
await mkdir(new URL("./state", import.meta.url), { recursive: true });
await writeFile(new URL("./state/bootstrap-ready", import.meta.url), "ready");
console.log("bootstrap ready");
