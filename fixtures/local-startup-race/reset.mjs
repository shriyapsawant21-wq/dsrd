import { rm } from "node:fs/promises";

await rm(new URL("./state", import.meta.url), { recursive: true, force: true });
