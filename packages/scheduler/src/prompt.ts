import { createInterface } from "node:readline/promises";

export type PromptAdapter = {
  ask(message: string): Promise<string>;
  close(): void;
};

export function createReadlinePrompt(): PromptAdapter {
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  return {
    ask: (message) => readline.question(message),
    close: () => readline.close()
  };
}

export async function chooseMenuAction(
  prompt: PromptAdapter,
  log: (message: string) => void
): Promise<"search" | "replay" | "quit"> {
  while (true) {
    const answer = (await prompt.ask("Select an action [S/R/Q]: ")).trim().toLowerCase();

    if (answer === "s") return "search";
    if (answer === "r") return "replay";
    if (answer === "q") return "quit";

    log("Choose S, R, or Q.");
  }
}
