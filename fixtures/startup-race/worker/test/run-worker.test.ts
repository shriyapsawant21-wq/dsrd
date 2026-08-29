import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { runWorker } from "../src/run-worker.js";

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

async function startServer(
  statusCode: number,
  body: string,
): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(statusCode, { "content-type": "application/json" });
    response.end(body);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/work`;
}

describe("startup-race worker", () => {
  it("emits success for the expected API response", async () => {
    const url = await startServer(200, JSON.stringify({ status: "processed" }));
    const events: Array<{ service: string; event: string; detail?: string }> = [];

    await runWorker(fetch, url, (event) => events.push(event));

    expect(events).toEqual([{ service: "worker", event: "work_succeeded" }]);
  });

  it("fails once when the API returns a non-success status", async () => {
    const url = await startServer(503, JSON.stringify({ status: "unavailable" }));
    const events: Array<{ service: string; event: string; detail?: string }> = [];

    await expect(
      runWorker(fetch, url, (event) => events.push(event)),
    ).rejects.toThrow("API returned HTTP 503");

    expect(events).toEqual([
      {
        service: "worker",
        event: "api_request_failed",
        detail: "API returned HTTP 503",
      },
    ]);
  });

  it("fails when the API response body is not the expected JSON", async () => {
    const url = await startServer(200, JSON.stringify({ status: "wrong" }));
    const events: Array<{ service: string; event: string; detail?: string }> = [];

    await expect(
      runWorker(fetch, url, (event) => events.push(event)),
    ).rejects.toThrow("API returned an unexpected response body");

    expect(events).toEqual([
      {
        service: "worker",
        event: "api_request_failed",
        detail: "API returned an unexpected response body",
      },
    ]);
  });
});
