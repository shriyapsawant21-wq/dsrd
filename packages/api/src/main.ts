import { createApp } from "./app.js";
import { createProductionDiscoveryRunner } from "./production.js";
import { RunService } from "./run-service.js";
import { RunStore } from "./run-store.js";
import { createDefaultPlatform, createOnboardingService } from "@dsrd/scheduler";

const store = new RunStore();
const onboarding = createOnboardingService({ platform: createDefaultPlatform() });
const app = createApp(store, new RunService(store, createProductionDiscoveryRunner()), {
  inspect: (repository) => onboarding.inspect({ repository }),
  replay: onboarding.replay,
  search: onboarding.search,
});
const port = Number(process.env.DSRD_API_PORT ?? 4317);
app.listen(port, "127.0.0.1", () => console.log(`DSRD API listening on http://127.0.0.1:${port}`));
