import { describe, expect, it } from "vitest";
import { startApiServer } from "./server.js";

describe("startApiServer", () => {
  it("listens on an ephemeral loopback port and closes cleanly", async () => {
    const api = await startApiServer({ port: 0 });

    try {
      expect(api.url).toBe(`http://127.0.0.1:${api.port}`);
      const response = await fetch(`${api.url}/api/runs/missing`);
      expect(response.status).toBe(404);
    } finally {
      await api.close();
    }

    await expect(fetch(`${api.url}/api/runs/missing`)).rejects.toThrow();
  });
});
