import { expect, it, vi } from "vitest";
import { configureDirectoryPicker } from "./folder-picker.js";

it("enables native directory selection before opening the input", () => {
  const setAttribute = vi.fn();

  configureDirectoryPicker({ setAttribute });

  expect(setAttribute).toHaveBeenCalledWith("webkitdirectory", "");
  expect(setAttribute).toHaveBeenCalledWith("directory", "");
});
