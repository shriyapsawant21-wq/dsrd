import { createServer, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { probeTcpReadiness } from "../src/probes/tcp.js";

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

async function listen(port = 0): Promise<{ server: Server; port: number }> {
  const server = createServer((socket) => socket.end());
  servers.push(server);
  server.listen(port, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) {
    throw new Error("Expected TCP address information");
  }
  return { server, port: address.port };
}

async function unusedPort(): Promise<number> {
  const { server, port } = await listen();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("TCP readiness probe", () => {
  it("returns ready when the port accepts a connection", async () => {
    const { port } = await listen();

    const result = await probeTcpReadiness({
      service: "postgres",
      host: "127.0.0.1",
      port,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    expect(result.service).toBe("postgres");
    expect(result.kind).toBe("tcp");
    expect(result.status).toBe("ready");
    expect(result.observedAtMs).toEqual(expect.any(Number));
  });

  it("keeps polling through refusal until the port opens", async () => {
    const port = await unusedPort();
    setTimeout(() => {
      void listen(port);
    }, 40);

    const result = await probeTcpReadiness({
      service: "postgres",
      host: "127.0.0.1",
      port,
      timeoutMs: 500,
      pollIntervalMs: 10,
    });

    expect(result.status).toBe("ready");
  });

  it("returns timeout when the port never opens", async () => {
    const port = await unusedPort();

    const result = await probeTcpReadiness({
      service: "postgres",
      host: "127.0.0.1",
      port,
      timeoutMs: 60,
      pollIntervalMs: 10,
    });

    expect(result).toMatchObject({
      service: "postgres",
      kind: "tcp",
      status: "timeout",
    });
  });
});
