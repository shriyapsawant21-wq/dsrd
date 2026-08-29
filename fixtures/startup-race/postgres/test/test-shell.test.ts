import { describe, expect, it } from "vitest";

import { resolveTestShell } from "./test-shell.js";

describe("resolveTestShell", () => {
  it("uses the POSIX shell outside Windows and preserves the Git Bash default on Windows", () => {
    expect(resolveTestShell("linux")).toBe("/bin/sh");
    expect(resolveTestShell("darwin")).toBe("/bin/sh");
    expect(resolveTestShell("win32")).toBe("C:\\Program Files\\Git\\bin\\bash.exe");
  });

  it("allows an explicit shell command override", () => {
    expect(resolveTestShell("linux", "/custom/sh")).toBe("/custom/sh");
  });
});
