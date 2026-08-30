import { afterEach, expect, it, vi } from "vitest";
import { createRun, detectProjectPlatforms, subscribeRun, type Progress } from "./api.js";

class FakeEventSource {
  static latest: FakeEventSource | undefined;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(_url: string) {
    FakeEventSource.latest = this;
  }

  addEventListener(name: string, listener: EventListener) {
    const registered = this.listeners.get(name) ?? [];
    registered.push(listener as (event: MessageEvent) => void);
    this.listeners.set(name, registered);
  }

  emit(name: string, payload: unknown) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }

  close() {
    this.closed = true;
  }
}

afterEach(() => vi.unstubAllGlobals());

it("posts folder files with their browser-relative paths", async () => {
  const file = new File(["services: {}"], "compose.yaml");
  Object.defineProperty(file, "webkitRelativePath", { value: "demo/compose.yaml" });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ runId: "run-1" }) });
  vi.stubGlobal("fetch", fetchMock);

  await createRun([file]);

  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(form.get("relativePaths")).toBe(JSON.stringify(["demo/compose.yaml"]));
  expect(form.getAll("projectFiles")).toHaveLength(1);
});

it("detects local and Docker targets from selected project files", () => {
  const manifest = new File(["{}"], "manifest.json");
  const compose = new File(["services: {}"], "compose.yaml");

  expect(detectProjectPlatforms([manifest])).toEqual(["local-process"]);
  expect(detectProjectPlatforms([compose])).toEqual(["compose"]);
  expect(detectProjectPlatforms([manifest, compose])).toEqual(["local-process", "compose"]);
});

it("shows a stable upload error when the API returns an empty error response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: async () => "" }));

  await expect(createRun([new File(["services: {}"], "compose.yaml")])).rejects.toThrow("UPLOAD_API_UNAVAILABLE");
});

it("delivers the API's initial progress event", () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const received: Progress[] = [];

  const unsubscribe = subscribeRun("run-1", (event) => received.push(event), vi.fn());
  FakeEventSource.latest?.emit("progress", { runId: "run-1", phase: "exploring", percentage: 10, message: "Exploring schedules", testedSchedules: 0, failureCount: 0 });

  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ phase: "exploring", percentage: 10 });
  unsubscribe();
  expect(FakeEventSource.latest?.closed).toBe(true);
});
