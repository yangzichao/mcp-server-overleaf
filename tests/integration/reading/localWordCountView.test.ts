import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFakeExecutable } from "../../support/fakeExecutable.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * read_project's word_count on a server with only a Git token: texcount runs in the clone, so
 * an edit that is not pushed yet is counted. The fake texcount counts the words on lines that
 * do not start with a command and follows \input, printing texcount's own report format.
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

const MAIN = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "Three words here.",
  "\\input{sections/method}",
  "\\end{document}",
].join("\n");
const METHOD = "\\section{Method}\nTwo more.\n";

describe("read_project word_count without a session cookie", () => {
  let remote: FakeOverleafRemote;
  let programDirectory: string;
  let client: McpStdioClient | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", MAIN, "Draft");
    await remote.collaboratorPushes("sections/method.tex", METHOD, "Method");
    await remote.collaboratorPushes("refs.bib", "@article{a,\n}\n", "References");
    programDirectory = await mkdtemp(join(tmpdir(), "overleaf-fake-texcount-"));
    await writeFakeExecutable(programDirectory, "texcount", FAKE_TEXCOUNT);
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    remote.cleanUp();
    await rm(programDirectory, { recursive: true, force: true });
  });

  async function startClient(): Promise<McpStdioClient> {
    client = await McpStdioClient.start({
      ...remote.environment(),
      PATH: `${programDirectory}:${process.env.PATH ?? ""}`,
    });
    return client;
  }

  it("counts the likely main document and what it includes, edits not yet pushed included", async () => {
    const mcp = await startClient();
    expect(await mcp.call("read_project", { view: "word_count" })).toBe(
      [
        "texcount's word count for main.tex, the likely main document, in the local clone with edits not yet pushed:",
        "Words in text: 5",
        "Words in headings: 1",
        "Words outside text (captions and the like): 0",
        "Headings: 1",
        "Floats (figures, tables and the like): 0",
        "Inline math: 0",
        "Displayed math: 0",
        "Words in text by file:",
        "- main.tex: 3",
        "- sections/method.tex: 2",
      ].join("\n"),
    );

    await mcp.call("edit_file", {
      action: "replace_text",
      path: "sections/method.tex",
      findText: "Two more.",
      replaceWith: "Now four words here.",
    });
    const afterEdit = await mcp.call("read_project", { view: "word_count", path: "sections/method.tex" });
    expect(afterEdit.split("\n").slice(0, 2)).toEqual([
      "texcount's word count for sections/method.tex, in the local clone with edits not yet pushed:",
      "Words in text: 4",
    ]);
  });

  it("refuses a path that is missing or is not a .tex file", async () => {
    const mcp = await startClient();
    expect(await mcp.call("read_project", { view: "word_count", path: "missing.tex" })).toBe(
      'No file at "missing.tex". The .tex files are: main.tex, sections/method.tex.',
    );
    expect(await mcp.call("read_project", { view: "word_count", path: "refs.bib" })).toBe(
      "word_count counts a .tex file, and refs.bib is not one.",
    );
  });
});
