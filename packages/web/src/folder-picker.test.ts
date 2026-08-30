import { expect, it, vi } from "vitest";
import { configureDirectoryPicker } from "./folder-picker.js";

it("enables native directory selection before opening the input", () => {
  const setAttribute = vi.fn();
  const input = { setAttribute, webkitdirectory: false, directory: false };

  configureDirectoryPicker(input);

  expect(setAttribute).toHaveBeenCalledWith("webkitdirectory", "");
  expect(setAttribute).toHaveBeenCalledWith("directory", "");
  expect(input.webkitdirectory).toBe(true);
  expect(input.directory).toBe(true);
});
