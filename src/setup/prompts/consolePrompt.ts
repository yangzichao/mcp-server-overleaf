import { createInterface, type Interface } from "node:readline/promises";

export function writeLine(text = ""): void {
  process.stdout.write(`${text}\n`);
}

/**
 * Readline hides nothing by itself, so a pasted Overleaf token would sit in the terminal
 * scrollback of whoever ran this. Suppressing the echo keeps it out of anything the user
 * later copies or screenshots; it is still the same token in the same file afterwards.
 */
interface ReadlineEcho {
  _writeToOutput?: (text: string) => void;
}

export class ConsolePrompt {
  private readonly readline: Interface;

  constructor() {
    this.readline = createInterface({ input: process.stdin, output: process.stdout });
  }

  close(): void {
    this.readline.close();
  }

  async askForLine(question: string, defaultValue?: string): Promise<string> {
    const suffix = defaultValue === undefined ? "" : ` [${defaultValue}]`;
    const answer = (await this.readline.question(`${question}${suffix}: `)).trim();
    return answer || defaultValue || "";
  }

  async askForHiddenLine(question: string): Promise<string> {
    process.stdout.write(`${question}: `);
    const echo = this.readline as unknown as ReadlineEcho;
    const originalWrite = echo._writeToOutput;
    echo._writeToOutput = () => {};
    try {
      return (await this.readline.question("")).trim();
    } finally {
      echo._writeToOutput = originalWrite;
      writeLine();
    }
  }

  async askToConfirm(question: string, defaultAnswer: boolean): Promise<boolean> {
    const answer = (await this.readline.question(`${question} ${defaultAnswer ? "[Y/n]" : "[y/N]"}: `))
      .trim()
      .toLowerCase();
    if (!answer) return defaultAnswer;
    return answer === "y" || answer === "yes";
  }
}
