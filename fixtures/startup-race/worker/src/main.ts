import {
  runWorker,
  type WorkerFixtureEvent,
} from "./run-worker.js";

const apiUrl = process.env.API_URL ?? "http://api:3000/work";
const timeoutMs = Number.parseInt(process.env.API_TIMEOUT_MS ?? "2000", 10);

function emit(event: WorkerFixtureEvent): void {
  console.log(JSON.stringify(event));
}

try {
  await runWorker(fetch, apiUrl, emit, timeoutMs);
} catch {
  process.exitCode = 1;
}
