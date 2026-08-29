import express, { type Express } from "express";

export type FixtureEvent = {
  service: "api";
  event:
    | "db_connection_attempted"
    | "db_connection_succeeded"
    | "db_connection_failed"
    | "cache_connection_succeeded"
    | "cache_connection_failed";
  detail?: string;
};

export type EmitFixtureEvent = (event: FixtureEvent) => void;

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function initializeApi(
  connectDatabaseOnce: () => Promise<void>,
  connectCacheOnce: () => Promise<void>,
  emit: EmitFixtureEvent,
): Promise<Express> {
  emit({ service: "api", event: "db_connection_attempted" });
  try {
    await connectDatabaseOnce();
    emit({ service: "api", event: "db_connection_succeeded" });
  } catch (error) {
    emit({
      service: "api",
      event: "db_connection_failed",
      detail: errorDetail(error),
    });
    throw error;
  }

  try {
    await connectCacheOnce();
    emit({ service: "api", event: "cache_connection_succeeded" });
  } catch (error) {
    emit({
      service: "api",
      event: "cache_connection_failed",
      detail: errorDetail(error),
    });
  }

  const app = express();
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.get("/work", (_request, response) => {
    response.json({ status: "processed" });
  });
  return app;
}
