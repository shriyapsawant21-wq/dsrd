import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("logo asset", () => {
  it("uses a PNG color type with transparency", () => {
    const png = readFileSync(new URL("../public/dsrd-logo.png", import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([4, 6]).toContain(png[25]);
  });
});
