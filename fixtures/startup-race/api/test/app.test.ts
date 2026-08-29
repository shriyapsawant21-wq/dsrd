import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { initializeApi } from "../src/app.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("startup-race API", () => {
  it("serves health and work only after the database check succeeds", async () => {
    let databaseAttempts = 0;
    let cacheAttempts = 0;
    const events: Array<{ service: string; event: string; detail?: string }> = [];
    const app = await initializeApi(
      async () => {
        databaseAttempts += 1;
      },
      async () => {
        cacheAttempts += 1;
      },
      (event) => events.push(event),
    );

    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const work = await fetch(`http://127.0.0.1:${port}/work`);

    expect(databaseAttempts).toBe(1);
    expect(cacheAttempts).toBe(1);
    expect(await health.json()).toEqual({ status: "ok" });
    expect(await work.json()).toEqual({ status: "processed" });
    expect(events).toEqual([
      { service: "api", event: "db_connection_attempted" },
      { service: "api", event: "db_connection_succeeded" },
      { service: "api", event: "cache_connection_succeeded" },
    ]);
  });

  it("fails startup after one database attempt without retrying", async () => {
    let attempts = 0;
    const events: Array<{ service: string; event: string; detail?: string }> = [];

    await expect(
      initializeApi(
        async () => {
          attempts += 1;
          throw new Error("connect ECONNREFUSED");
        },
        async () => undefined,
        (event) => events.push(event),
      ),
    ).rejects.toThrow("connect ECONNREFUSED");

    expect(attempts).toBe(1);
    expect(events).toEqual([
      { service: "api", event: "db_connection_attempted" },
      {
        service: "api",
        event: "db_connection_failed",
        detail: "connect ECONNREFUSED",
      },
    ]);
  });

  it("fails startup after one cache attempt without retrying", async () => {
    let attempts = 0;
    const events: Array<{ service: string; event: string; detail?: string }> = [];

    await expect(
      initializeApi(
        async () => undefined,
        async () => {
          attempts += 1;
          throw new Error("connect ECONNREFUSED cache:6379");
        },
        (event) => events.push(event),
      ),
    ).rejects.toThrow("connect ECONNREFUSED cache:6379");

    expect(attempts).toBe(1);
    expect(events).toEqual([
      { service: "api", event: "db_connection_attempted" },
      { service: "api", event: "db_connection_succeeded" },
      {
        service: "api",
        event: "cache_connection_failed",
        detail: "connect ECONNREFUSED cache:6379",
      },
    ]);
  });
});
