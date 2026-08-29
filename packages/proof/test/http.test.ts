import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { probeHttpReadiness } from "../src/probes/http.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
        }),
    ),
  );
});

async function listen(
  body: string,
  statusCode = 200,
  port = 0,
): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(statusCode, { "content-type": "application/json" });
    response.end(body);
  });
  servers.push(server);
  server.listen(port, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}/health` };
}

async function unusedPort(): Promise<number> {
  const { server } = await listen("", 200);
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("HTTP readiness probe", () => {
  it("returns ready for HTTP 200 with the expected health body", async () => {
    const { url } = await listen(JSON.stringify({ status: "ok" }));

    const result = await probeHttpReadiness({
      service: "api",
      url,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    expect(result.service).toBe("api");
    expect(result.kind).toBe("http");
    expect(result.status).toBe("ready");
    expect(result.observedAtMs).toEqual(expect.any(Number));
  });

  it("returns unhealthy for a reachable endpoint with malformed health JSON", async () => {
    const { url } = await listen(JSON.stringify({ status: "starting" }));

    const result = await probeHttpReadiness({
      service: "api",
      url,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    expect(result).toMatchObject({
      service: "api",
      kind: "http",
      status: "unhealthy",
      detail: "Expected HTTP 200 with { status: 'ok' }",
    });
  });

  it("keeps polling through connection errors until the endpoint is ready", async () => {
    const port = await unusedPort();
    setTimeout(() => {
      void listen(JSON.stringify({ status: "ok" }), 200, port);
    }, 40);

    const result = await probeHttpReadiness({
      service: "api",
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    expect(result.status).toBe("ready");
  });

  it("returns timeout when readiness never appears", async () => {
    const port = await unusedPort();

    const result = await probeHttpReadiness({
      service: "api",
      url: `http://127.0.0.1:${port}/health`,
      timeoutMs: 60,
      pollIntervalMs: 10,
    });

    expect(result).toMatchObject({
      service: "api",
      kind: "http",
      status: "timeout",
    });
  });
});
