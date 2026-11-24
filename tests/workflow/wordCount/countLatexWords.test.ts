import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsafeRepositoryPathError } from "../../../src/overleaf/repositoryPaths.js";
import { countLatexWords, WordCountFailedError } from "../../../src/workflow/wordCount/countLatexWords.js";
import { writeFakeExecutable, writeHangingExecutable } from "../../support/fakeExecutable.js";
import { shouldRunTexcountTests } from "../../support/texAvailability.js";

let temporaryDirectory: string;
let programDirectory: string;
let projectDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "overleaf-word-count-"));
  programDirectory = join(temporaryDirectory, "bin");
  projectDirectory = join(temporaryDirectory, "project");
  await mkdir(programDirectory);
  await mkdir(projectDirectory);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

const ONE_FILE_OUTPUT = [
  "File: ./main.tex",
  "Encoding: ascii",
  "Words in text: 4",
  "Words in headers: 0",
  "Words outside text (captions, etc.): 0",
  "Number of headers: 0",
  "Number of floats/tables/figures: 0",
  "Number of math inlines: 0",
  "Number of math displayed: 0",
  "",
].join("\n");

async function installFakeTexcount(javascript: string): Promise<void> {
  await writeFakeExecutable(programDirectory, "texcount", javascript);
  vi.stubEnv("PATH", programDirectory);
}

async function writeProjectFile(path: string, lines: string[]): Promise<void> {
  const fullPath = join(projectDirectory, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${lines.join("\n")}\n`);
}

describe("countLatexWords", () => {
  it("runs texcount -nocol -inc on the main file, in the project directory", async () => {
    const callFile = join(temporaryDirectory, "call.json");
    await installFakeTexcount(
      [
        `require("node:fs").writeFileSync(${JSON.stringify(callFile)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));`,
        `process.stdout.write(${JSON.stringify(ONE_FILE_OUTPUT)});`,
      ].join("\n"),
    );

    const count = await countLatexWords({ projectDirectory, mainTexFile: "chapters/../main.tex" });
    expect(JSON.parse(await readFile(callFile, "utf8"))).toEqual({
      argv: ["-nocol", "-inc", "./main.tex"],
      cwd: await realpath(projectDirectory),
    });
    const counts = {
      wordsInText: 4,
      wordsInHeaders: 0,
      wordsOutsideText: 0,
      headers: 0,
      floats: 0,
      inlineMath: 0,
      displayedMath: 0,
    };
    expect(count).toEqual({
      mainTexFile: "main.tex",
      totals: counts,
      files: [{ path: "main.tex", counts, sections: [] }],
      problems: [],
    });

    await countLatexWords({ projectDirectory, mainTexFile: "-draft.tex" });
    expect(JSON.parse(await readFile(callFile, "utf8")).argv).toEqual(["-nocol", "-inc", "./-draft.tex"]);
  });

  it("says texcount is not installed, and tells that apart from a missing project directory", async () => {
    vi.stubEnv("PATH", programDirectory);
    const notInstalled = countLatexWords({ projectDirectory, mainTexFile: "main.tex" });
    await expect(notInstalled).rejects.toBeInstanceOf(WordCountFailedError);
    await expect(notInstalled).rejects.toThrow(/^texcount was not found on PATH\. .*tlmgr install texcount/);

    await installFakeTexcount(`process.stdout.write(${JSON.stringify(ONE_FILE_OUTPUT)});`);
    const missingDirectory = join(temporaryDirectory, "gone");
    await expect(
      countLatexWords({ projectDirectory: missingDirectory, mainTexFile: "main.tex" }),
    ).rejects.toThrow(`The project directory ${missingDirectory} does not exist.`);
  });

  it("refuses a main file outside the project before running anything", async () => {
    vi.stubEnv("PATH", programDirectory);
    await expect(countLatexWords({ projectDirectory, mainTexFile: "../outside.tex" })).rejects.toBeInstanceOf(
      UnsafeRepositoryPathError,
    );
  });

  it("reports a failing texcount with its exit status and its last words", async () => {
    await installFakeTexcount(`process.stderr.write("Can't locate Encode.pm in @INC\\n"); process.exit(2);`);
    await expect(countLatexWords({ projectDirectory, mainTexFile: "main.tex" })).rejects.toThrow(
      "texcount failed (2): Can't locate Encode.pm in @INC",
    );
  });

  it("says why nothing was counted when texcount cannot read the main file", async () => {
    const unreadable = "\n!!! File not found or not readable: ./nope.tex !!!\n(errors:1)\n";
    await installFakeTexcount(`process.stdout.write(${JSON.stringify(unreadable)});`);
    await expect(countLatexWords({ projectDirectory, mainTexFile: "nope.tex" })).rejects.toThrow(
      "texcount counted nothing in nope.tex: File not found or not readable: ./nope.tex",
    );
  });

  it("stops texcount when it runs past the time limit", async () => {
    await writeHangingExecutable(programDirectory, "texcount", join(temporaryDirectory, "texcount.pid"));
    vi.stubEnv("PATH", programDirectory);
    await expect(
      countLatexWords({ projectDirectory, mainTexFile: "main.tex", timeoutMs: 500 }),
    ).rejects.toThrow("texcount did not finish within 500 ms.");
  });
});

describe.runIf(await shouldRunTexcountTests())("countLatexWords with the real texcount", () => {
  it("counts a document split across files, and names an included file it cannot find", async () => {
    await writeProjectFile("main.tex", [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\title{A Title}",
      "\\section{Introduction}",
      "Hello world, this is text. $x+y$ and",
      "\\[ E = mc^2 \\]",
      "\\input{sections/method}",
      "\\include{appendix}",
      "\\input{missing}",
      "\\begin{figure}\\caption{A caption here}\\end{figure}",
      "\\end{document}",
    ]);
    await writeProjectFile("sections/method.tex", [
      "\\section{Method}",
      "We do things in three words. \u00dcn\u00efcode w\u00f6rds too.",
    ]);
    await writeProjectFile("appendix.tex", ["\\section{Appendix}", "More text here."]);

    const count = await countLatexWords({ projectDirectory, mainTexFile: "main.tex" });
    expect(count.totals).toEqual({
      wordsInText: 18,
      wordsInHeaders: 5,
      wordsOutsideText: 3,
      headers: 4,
      floats: 1,
      inlineMath: 1,
      displayedMath: 1,
    });
    expect(count.files.map((file) => [file.path, file.counts.wordsInText])).toEqual([
      ["main.tex", 6],
      ["sections/method.tex", 9],
      ["appendix.tex", 3],
    ]);
    expect(count.problems).toEqual(["File missing not found in path [./]."]);
  });

  it("follows \\subfile, \\import and \\subimport in a document that loads their packages", async () => {
    await writeProjectFile("main.tex", [
      "\\documentclass{article}",
      "\\usepackage{import}",
      "\\usepackage{subfiles}",
      "\\begin{document}",
      "\\subfile{chapters/first}",
      "\\import{chapters/}{second}",
      "\\subimport{chapters/}{second}",
      "\\end{document}",
    ]);
    await writeProjectFile("chapters/first.tex", [
      "\\documentclass[../main]{subfiles}",
      "\\begin{document}",
      "Subfile words count here.",
      "\\end{document}",
    ]);
    await writeProjectFile("chapters/second.tex", ["Imported words."]);

    const count = await countLatexWords({ projectDirectory, mainTexFile: "main.tex" });
    expect(count.files.map((file) => [file.path, file.counts.wordsInText])).toEqual([
      ["main.tex", 0],
      ["chapters/first.tex", 4],
      ["chapters/second.tex", 2],
      ["chapters/second.tex", 2],
    ]);
    expect(count.totals.wordsInText).toBe(8);
  });
});
