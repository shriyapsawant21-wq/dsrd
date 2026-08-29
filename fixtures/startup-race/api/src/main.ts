import { Client } from "pg";
import { createClient } from "redis";

import { initializeApi, type FixtureEvent } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const connectionTimeoutMillis = Number.parseInt(
  process.env.DB_CONNECT_TIMEOUT_MS ?? "2000",
  10,
);

function emit(event: FixtureEvent): void {
  console.log(JSON.stringify(event));
}

async function connectOnce(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? "postgres",
    port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME ?? "race_demo",
    user: process.env.DB_USER ?? "race_demo",
    password: process.env.DB_PASSWORD ?? "race_demo",
    connectionTimeoutMillis,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function connectCacheOnce(): Promise<void> {
  const client = createClient({
    url: `redis://${process.env.CACHE_HOST ?? "cache"}:${process.env.CACHE_PORT ?? "6379"}`,
    socket: { connectTimeout: connectionTimeoutMillis },
  });
  try {
    await client.connect();
    await client.ping();
  } finally {
    if (client.isOpen) await client.quit().catch(() => undefined);
  }
}

try {
  const app = await initializeApi(connectOnce, connectCacheOnce, emit);
  app.listen(port, "0.0.0.0", () => {
    console.log(
      JSON.stringify({ service: "api", event: "http_server_listening" }),
    );
  });
} catch {
  process.exitCode = 1;
}
