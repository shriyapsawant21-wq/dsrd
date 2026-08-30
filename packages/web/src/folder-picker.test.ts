import { expect, it, vi } from "vitest";
import { collectDirectoryFiles, configureDirectoryPicker } from "./folder-picker.js";

it("enables native directory selection before opening the input", () => {
  const setAttribute = vi.fn();
  const input = { setAttribute, webkitdirectory: false, directory: false };

  configureDirectoryPicker(input);

  expect(setAttribute).toHaveBeenCalledWith("webkitdirectory", "");
  expect(setAttribute).toHaveBeenCalledWith("directory", "");
  expect(input.webkitdirectory).toBe(true);
  expect(input.directory).toBe(true);
});

it("preserves relative paths from a selected directory", async () => {
  const file = new File(["services: {}"], "compose.yaml");
  const root = {
    kind: "directory" as const,
    name: "demo",
    async *values() { yield { kind: "file" as const, name: "compose.yaml", getFile: async () => file }; }
  };

  const files = await collectDirectoryFiles(root, root.name);

  expect((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath).toBe("demo/compose.yaml");
});
