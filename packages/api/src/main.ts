import { startApiServer } from "./server.js";

try {
  const api = await startApiServer();
  console.log(`DSRD API listening on ${api.url}`);
} catch (error) {
  console.error("Failed to start DSRD API", error);
  process.exitCode = 1;
}
