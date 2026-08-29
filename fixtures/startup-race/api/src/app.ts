import express, { type Express } from "express";

export type FixtureEvent = {
  service: "api";
  event: "db_connection_succeeded" | "db_connection_failed";
  detail?: string;
};

export type EmitFixtureEvent = (event: FixtureEvent) => void;

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function initializeApi(
  connectOnce: () => Promise<void>,
  emit: EmitFixtureEvent,
): Promise<Express> {
  try {
    await connectOnce();
    emit({ service: "api", event: "db_connection_succeeded" });
  } catch (error) {
    emit({
      service: "api",
      event: "db_connection_failed",
      detail: errorDetail(error),
    });
    throw error;
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
