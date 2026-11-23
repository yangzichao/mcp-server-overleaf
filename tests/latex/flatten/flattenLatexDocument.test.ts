import { describe, expect, it } from "vitest";

import {
  FlattenedDocumentTooLongError,
  flattenLatexDocument,
} from "../../../src/latex/flatten/flattenLatexDocument.js";
import { inMemoryProject } from "../support/inMemoryProject.js";

const begin = (path: string, written: string) => `% ---- begin ${path}, from ${written} ----\n`;
const end = (path: string) => `% ---- end ${path} ----`;

describe("flattenLatexDocument", () => {
  it("inlines an \\input in place, framed by markers, without adding a blank line", async () => {
    const project = inMemoryProject({
      "main.tex": "\\begin{document}\n\\input{intro}\n\\end{document}\n",
      "intro.tex": "Hello.\n",
    });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toBe(
      `\\begin{document}\n${begin("intro.tex", "\\input{intro}")}Hello.\n${end("intro.tex")}\n\\end{document}\n`,
    );
    expect(flattened.inlinedFiles).toEqual(["intro.tex"]);
    expect(flattened.missingIncludes).toEqual([]);
  });

  it("wraps an \\include in \\clearpage{} as LaTeX and latexpand do", async () => {
    const project = inMemoryProject({
      "main.tex": "\\include{chapters/one}\nAfter.\n",
      "chapters/one.tex": "\\chapter{One}",
    });
    const { text } = await flattenLatexDocument(project, "main.tex");
    expect(text).toBe(
      `\\clearpage{}%\n${begin("chapters/one.tex", "\\include{chapters/one}")}\\chapter{One}\n${end("chapters/one.tex")}\n\\clearpage{}\nAfter.\n`,
    );
  });

  it("breaks the line with % before a directive in mid-line and keeps the text after it", async () => {
    const project = inMemoryProject({ "main.tex": "See \\input{table} below.\n", "table.tex": "x" });
    const { text } = await flattenLatexDocument(project, "main.tex");
    expect(text).toBe(`See %\n${begin("table.tex", "\\input{table}")}x\n${end("table.tex")}\n below.\n`);
  });

  it("lets the end marker absorb a trailing comment, and inlines two includes on one line", async () => {
    const project = inMemoryProject({
      "main.tex": "\\input{a} % first part\n\\input{a}\\input{b}\n",
      "a.tex": "A\n",
      "b.tex": "B\n",
    });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toBe(
      [
        `${begin("a.tex", "\\input{a}")}A\n${end("a.tex")} % first part\n`,
        `${begin("a.tex", "\\input{a}")}A\n${end("a.tex")}\n`,
        `${begin("b.tex", "\\input{b}")}B\n${end("b.tex")}\n`,
      ].join(""),
    );
    expect(flattened.inlinedFiles).toEqual(["a.tex", "b.tex"]);
  });

  it("does not follow a commented-out directive or one inside verbatim", async () => {
    const root =
      "% \\input{old}\n\\begin{verbatim}\n\\input{listing}\n\\end{verbatim}\n\\verb|x| 100\\% \\input{new}\n";
    const project = inMemoryProject({ "main.tex": root, "new.tex": "N\n" });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toBe(
      `% \\input{old}\n\\begin{verbatim}\n\\input{listing}\n\\end{verbatim}\n\\verb|x| 100\\% %\n${begin("new.tex", "\\input{new}")}N\n${end("new.tex")}\n`,
    );
    expect(flattened.missingIncludes).toEqual([]);
    expect(project.reads).toEqual(["main.tex", "new.tex"]);
  });

  it("leaves a missing include in place after a marker, and reports where it was", async () => {
    const project = inMemoryProject({ "main.tex": "Intro\n\\input{sections/missing}\n" });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toBe(
      "Intro\n% ---- not inlined: no such file, tried sections/missing.tex, sections/missing ----\n\\input{sections/missing}\n",
    );
    expect(flattened.missingIncludes).toEqual([
      {
        written: "\\input{sections/missing}",
        location: { path: "main.tex", line: 2 },
        tried: ["sections/missing.tex", "sections/missing"],
      },
    ]);
  });

  it("stops at an include cycle instead of looping", async () => {
    const project = inMemoryProject({
      "main.tex": "\\input{a}\n",
      "a.tex": "A starts\n\\input{b}\n",
      "b.tex": "B then back to \\input{a}\n",
    });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toContain(
      "B then back to %\n% ---- not inlined: a.tex is already being inlined here, an include cycle ----\n\\input{a}\n",
    );
    expect(flattened.skippedIncludes).toEqual([
      {
        written: "\\input{a}",
        location: { path: "b.tex", line: 1 },
        reason: "a.tex is already being inlined here, an include cycle",
      },
    ]);
    expect(flattened.inlinedFiles).toEqual(["a.tex", "b.tex"]);
  });

  it("follows \\import into its directory, so the imported file's own includes resolve there", async () => {
    const project = inMemoryProject({
      "main.tex": "\\import{chapters/}{one}\n",
      "chapters/one.tex": "One: \\input{part}\n",
      "chapters/part.tex": "Part.\n",
    });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.inlinedFiles).toEqual(["chapters/one.tex", "chapters/part.tex"]);
    expect(flattened.text).toContain("Part.\n% ---- end chapters/part.tex ----");
  });

  it("inlines only the document body of a \\subfile", async () => {
    const project = inMemoryProject({
      "main.tex": "\\subfile{sections/a}\n",
      "sections/a.tex":
        "\\documentclass[../main.tex]{subfiles}\n\\begin{document}\nBody of A.\n\\end{document}\nIgnored.\n",
    });
    const { text } = await flattenLatexDocument(project, "main.tex");
    expect(text).toBe(
      `${begin("sections/a.tex", "\\subfile{sections/a}")}Body of A.\n${end("sections/a.tex")}\n`,
    );
  });

  it("stops reading a file at \\endinput, keeping what follows it on that line", async () => {
    const project = inMemoryProject({
      "main.tex": "\\input{bare}\n\\input{trailing}\n",
      "bare.tex": "Kept.\n\\endinput\nDropped.\n",
      "trailing.tex": "Kept too.\n\\endinput and this\nDropped.\n",
    });
    const { text } = await flattenLatexDocument(project, "main.tex");
    expect(text).toBe(
      `${begin("bare.tex", "\\input{bare}")}Kept.\n${end("bare.tex")}\n${begin("trailing.tex", "\\input{trailing}")}Kept too.\n and this\n${end("trailing.tex")}\n`,
    );
  });

  it("leaves a file that cannot be read as text as written", async () => {
    const project = inMemoryProject({ "main.tex": "\\input{table}\n" }, ["table.tex"]);
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toBe(
      "% ---- not inlined: table.tex could not be read as text: No text file at table.tex ----\n\\input{table}\n",
    );
    expect(flattened.skippedIncludes).toHaveLength(1);
    expect(flattened.inlinedFiles).toEqual([]);
  });

  it("keeps CRLF line ends and counts a path built from macros without following it", async () => {
    const project = inMemoryProject({ "main.tex": "\\input{a}\r\n\\input{\\dir/b}\r\n", "a.tex": "A\r\n" });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text).toBe(
      `${begin("a.tex", "\\input{a}")}A\r\n${end("a.tex")}\r\n\\input{\\dir/b}\r\n`,
    );
    expect(flattened.pathsBuiltFromMacros).toBe(1);
  });

  it("reads a file included twice only once, and inlines it both times", async () => {
    const project = inMemoryProject({ "main.tex": "\\input{a}\n\\input{a}\n", "a.tex": "A\n" });
    const flattened = await flattenLatexDocument(project, "main.tex");
    expect(flattened.text.match(/^A$/gm)).toHaveLength(2);
    expect(project.reads).toEqual(["main.tex", "a.tex"]);
  });

  it("refuses a document that includes one large file many times before building it", async () => {
    const project = inMemoryProject({
      "main.tex": "\\input{chapter}\n".repeat(60),
      "chapter.tex": "\\input{table}\n".repeat(90),
      "table.tex": "x".repeat(100_000),
    });
    const started = performance.now();
    await expect(flattenLatexDocument(project, "main.tex")).rejects.toThrow(FlattenedDocumentTooLongError);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("flattens a file of many includes at once", async () => {
    const project = inMemoryProject({ "main.tex": "\\input{b}\n".repeat(40_000), "b.tex": "x\n" });
    const started = performance.now();
    const { inlinedFiles } = await flattenLatexDocument(project, "main.tex");
    expect(performance.now() - started).toBeLessThan(1000);
    expect(inlinedFiles).toEqual(["b.tex"]);
  });

  it("flattens many includes on one long line at once", async () => {
    const line = `${"\\input{b}".repeat(50_000)}${"x".repeat(5_000_000)}\n`;
    const project = inMemoryProject({ "main.tex": line, "b.tex": "x\n" });
    const started = performance.now();
    const { text } = await flattenLatexDocument(project, "main.tex");
    expect(performance.now() - started).toBeLessThan(1000);
    expect(text.endsWith(`${end("b.tex")}\n${"x".repeat(5_000_000)}\n`)).toBe(true);
  });
});
