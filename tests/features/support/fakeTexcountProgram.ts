import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFakeExecutable } from "../../support/fakeExecutable.js";

/**
 * Counts the words on lines that do not start with a command, follows \input, and prints the
 * report in texcount's own format, so a scenario knows every number without a TeX install.
 */
const FAKE_TEXCOUNT = String.raw`
const { readFileSync } = require("node:fs");
const mainFile = process.argv[process.argv.length - 1];
const countWords = (text) =>
  text.split("\n").filter((line) => !line.trim().startsWith("\\")).join(" ").split(/\s+/).filter(Boolean).length;
const files = [];
function visit(path, label) {
  const text = readFileSync(path, "utf8");
  files.push({ label, path, words: countWords(text) });
  for (const match of text.matchAll(/\\input\{([^}]+)\}/g)) visit("./" + match[1] + ".tex", "Included file");
}
visit(mainFile, "File");
const block = (header, words) => [
  header,
  "Words in text: " + words,
  "Words in headers: 1",
  "Words outside text (captions, etc.): 0",
  "Number of headers: 1",
  "Number of floats/tables/figures: 0",
  "Number of math inlines: 0",
  "Number of math displayed: 0",
  "",
];
const lines = files.flatMap((file) => block(file.label + ": " + file.path, file.words));
if (files.length > 1) {
  lines.push(...block("Sum of files: " + mainFile, files.reduce((sum, file) => sum + file.words, 0)));
}
process.stdout.write(lines.join("\n"));
`;

export class FakeTexcountProgram {
  private constructor(private readonly programDirectory: string) {}

  static async install(): Promise<FakeTexcountProgram> {
    const programDirectory = mkdtempSync(join(tmpdir(), "overleaf-feature-texcount-"));
    await writeFakeExecutable(programDirectory, "texcount", FAKE_TEXCOUNT);
    return new FakeTexcountProgram(programDirectory);
  }

  /** PATH with this texcount ahead of any real one. */
  pathEnvironment(): NodeJS.ProcessEnv {
    return { PATH: `${this.programDirectory}:${process.env.PATH ?? ""}` };
  }

  remove(): void {
    rmSync(this.programDirectory, { recursive: true, force: true });
  }
}
