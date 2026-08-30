import express, { type Express } from "express";

import type { JobManager } from "./job-manager.js";
import { apiErrorHandler, registerRoutes } from "./routes.js";

export type BackendAppOptions = {
  jobs: JobManager;
};

export function createBackendApp(options: BackendAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  registerRoutes(app, options.jobs);
  app.use(apiErrorHandler);
  return app;
}
