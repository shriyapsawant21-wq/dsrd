import type { Server } from "node:http";
import { createApp } from "./app.js";
import { createProductionDiscoveryRunner } from "./production.js";
import { RunService } from "./run-service.js";
import { RunStore } from "./run-store.js";

export type ApiServerOptions = {
  host?: string;
  port?: number;
};

export type StartedApiServer = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export async function startApiServer(options: ApiServerOptions = {}): Promise<StartedApiServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.DSRD_API_PORT ?? 4317);
  const store = new RunStore();
  const expressApp = createApp(store, new RunService(store, createProductionDiscoveryRunner()));

  const server = await listen(expressApp, host, port);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("DSRD API did not bind to a TCP port");
  }

  return {
    url: `http://${host}:${address.port}`,
    port: address.port,
    close: () => closeServer(server),
  };
}

function listen(expressApp: ReturnType<typeof createApp>, host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = expressApp.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
    server.once("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
