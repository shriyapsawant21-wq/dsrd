import { expect, it } from "vitest";

import { chooseMenuAction, type PromptAdapter } from "./prompt.js";

it("retries after an invalid menu selection", async () => {
  const answers = ["x", "S"];
  const output: string[] = [];
  const prompt: PromptAdapter = {
    ask: async () => answers.shift() ?? "",
    close: () => undefined
  };

  await expect(chooseMenuAction(prompt, (message) => output.push(message))).resolves.toBe("search");
  expect(output).toContain("Choose S, R, or Q.");
});
