import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FAKE_PDF_BYTES } from "../fakeOverleafAccount.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

const LOG_WITH_ERRORS = [
  "This is pdfTeX, Version 3.141592653",
  "(./main.tex",
  "./main.tex:3: Undefined control sequence.",
  "l.3 \\foo",
  "LaTeX Warning: Reference `fig:missing' on page 1 undefined on input line 5.",
  ")",
  "Output written on output.pdf (1 page).",
].join("\n");

describe("compiling on Overleaf", () => {
  const harness = useEditorTestHarness();

  /** This server's build cache for the project, outside the clone, where Overleaf's output is kept. */
  function overleafOutputDirectory(): string {
    return join(harness.gitRemote.workspaceDirectory, ".build", harness.gitRemote.projectId, "overleaf");
  }

  it("compiles with the editor's request and reports a clean build", async () => {
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).toContain("Compiled on Overleaf.");
    expect(report).toContain("Output files: output.pdf, output.log");
    const [compile] = harness.editor.web.account.compiles;
    expect(compile?.query).toBe("file_line_errors=true");
    expect(compile?.body).toEqual({
      check: "silent",
      draft: false,
      incrementalCompilesEnabled: true,
      stopOnFirstError: false,
    });
  });

  it("passes the root document and draft mode when asked", async () => {
    const client = await harness.startClient();
    await client.call("compile_project", { where: "overleaf", mainTexFile: "thesis.tex", draft: true });
    expect(harness.editor.web.account.compiles[0]?.body).toMatchObject({
      rootResourcePath: "thesis.tex",
      draft: true,
    });
  });

  it("reports errors and warnings from the log even when a PDF was produced", async () => {
    harness.editor.web.account.compileLog = LOG_WITH_ERRORS;
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).toContain("Compiled on Overleaf with 1 error; a PDF was still produced.");
    expect(report).toContain("./main.tex:3: Undefined control sequence.");
    expect(report).toContain("LaTeX Warning: Reference `fig:missing' on page 1 undefined");
  });

  it("reads BibTeX's output.blg too, where a missing entry is reported", async () => {
    harness.editor.web.account.bibliographyLog = [
      "This is BibTeX, Version 0.99d (TeX Live 2025)",
      'Warning--I didn\'t find a database entry for "smith2020"',
      "I couldn't open database file refs.bib",
      "(There was 1 error message)",
    ].join("\n");
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).toContain("Compiled on Overleaf with 1 error; a PDF was still produced.");
    expect(report).toContain("I couldn't open database file refs.bib");
    expect(report).toContain('Warning--I didn\'t find a database entry for "smith2020"');
    expect(harness.editor.web.account.outputDownloads).toContain("output.blg");
  });

  it("says no PDF was produced on failure, with the end of the log, and keeps the log", async () => {
    harness.editor.web.account.compileStatus = "failure";
    harness.editor.web.account.producesPdf = false;
    harness.editor.web.account.compileLog = "Emergency stop.\nNo pages of output.";
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).toContain("FAILED to compile on Overleaf: no PDF was produced.");
    expect(report).toContain("No pages of output.");
    expect(report).not.toContain("Saved the PDF");
    expect(report).toContain(`Saved the log to ${join(overleafOutputDirectory(), "output.log")}.`);
    expect(readFileSync(join(overleafOutputDirectory(), "output.log"), "utf8")).toBe(
      "Emergency stop.\nNo pages of output.",
    );
  });

  it("explains a status the editor would show as a banner", async () => {
    harness.editor.web.account.compileStatus = "timedout";
    harness.editor.web.account.producesPdf = false;
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).toContain('Overleaf did not compile the project (status "timedout").');
    expect(report).toContain("time limit");
  });

  it("waits out one too-recently-compiled refusal and compiles", async () => {
    harness.editor.web.account.refuseCompilesAsTooRecent = 1;
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).toContain("Compiled on Overleaf.");
    expect(harness.editor.web.account.compiles).toHaveLength(2);
  });

  it("saves the PDF and the log in the build directory, fetched from the web origin with the compile server's routing", async () => {
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    const pdfPath = join(overleafOutputDirectory(), "output.pdf");
    const logPath = join(overleafOutputDirectory(), "output.log");
    expect(report).toContain(`Saved the PDF (${FAKE_PDF_BYTES.length} bytes) to ${pdfPath}.`);
    expect(report).toContain(`Saved the log to ${logPath}.`);
    expect(readFileSync(pdfPath)).toEqual(FAKE_PDF_BYTES);
    expect(readFileSync(logPath, "utf8")).toBe(harness.editor.web.account.compileLog);
    // In the order the compile lists them, which puts the PDF first.
    expect(harness.editor.web.account.outputDownloads).toEqual(["output.pdf", "output.log"]);
    // The build directory is outside the clone, so nothing compiled is ever pushed.
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  });

  it("also saves the bibliography, its log and the SyncTeX map, and lists every saved path", async () => {
    const account = harness.editor.web.account;
    account.bibliography =
      "\\begin{thebibliography}{1}\n\\bibitem{knuth1984} D. Knuth.\n\\end{thebibliography}\n";
    account.bibliographyLog = "This is BibTeX, Version 0.99d (TeX Live 2025)\n";
    account.synctexBytes = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02]);
    const client = await harness.startClient();
    const report = await client.call("compile_project", { where: "overleaf" });
    const directory = overleafOutputDirectory();
    expect(report).toContain(
      `Saved the PDF (${FAKE_PDF_BYTES.length} bytes) to ${join(directory, "output.pdf")}.`,
    );
    expect(report).toContain(`Saved the log to ${join(directory, "output.log")}.`);
    expect(report).toContain(
      `Saved the bibliography BibTeX or Biber wrote (output.bbl) to ${join(directory, "output.bbl")}.`,
    );
    expect(report).toContain(
      `Saved the BibTeX or Biber log (output.blg) to ${join(directory, "output.blg")}.`,
    );
    expect(report).toContain(
      `Saved the SyncTeX map from PDF positions to source lines (output.synctex.gz) to ${join(directory, "output.synctex.gz")}.`,
    );
    expect(readFileSync(join(directory, "output.bbl"), "utf8")).toBe(account.bibliography);
    expect(readFileSync(join(directory, "output.blg"), "utf8")).toBe(account.bibliographyLog);
    expect(readFileSync(join(directory, "output.synctex.gz"))).toEqual(account.synctexBytes);
  });

  it("removes the bibliography and SyncTeX map an earlier compile left when this one has none", async () => {
    const account = harness.editor.web.account;
    account.bibliography = "\\begin{thebibliography}{1}\n\\end{thebibliography}\n";
    account.synctexBytes = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
    const client = await harness.startClient();
    await client.call("compile_project", { where: "overleaf" });
    expect(existsSync(join(overleafOutputDirectory(), "output.bbl"))).toBe(true);

    account.bibliography = undefined;
    account.synctexBytes = undefined;
    const report = await client.call("compile_project", { where: "overleaf" });
    expect(report).not.toContain("output.bbl) to");
    expect(existsSync(join(overleafOutputDirectory(), "output.bbl"))).toBe(false);
    expect(existsSync(join(overleafOutputDirectory(), "output.synctex.gz"))).toBe(false);
  });

  it("removes an earlier PDF when a later compile produces none, so a stale PDF is never mistaken for this one", async () => {
    const client = await harness.startClient();
    await client.call("compile_project", { where: "overleaf" });
    expect(existsSync(join(overleafOutputDirectory(), "output.pdf"))).toBe(true);

    harness.editor.web.account.compileStatus = "failure";
    harness.editor.web.account.producesPdf = false;
    await client.call("compile_project", { where: "overleaf" });
    expect(existsSync(join(overleafOutputDirectory(), "output.pdf"))).toBe(false);
  });

  it("never replaces a file there that is not a PDF", async () => {
    mkdirSync(overleafOutputDirectory(), { recursive: true });
    const notAPdf = join(overleafOutputDirectory(), "output.pdf");
    writeFileSync(notAPdf, "my notes, misnamed");
    const client = await harness.startClient();
    const refused = await client.call("compile_project", { where: "overleaf" });
    expect(refused).toContain("already exists and is not a PDF");
    expect(readFileSync(notAPdf, "utf8")).toBe("my notes, misnamed");
  });

  it("refuses an Overleaf-only option with a local compile, naming where it applies", async () => {
    const client = await harness.startClient();
    expect(await client.call("compile_project", { draft: true })).toBe(
      "draft does not apply to local; overleaf uses it.",
    );
    expect(await client.call("compile_project", { where: "local", stopOnFirstError: true })).toBe(
      "stopOnFirstError does not apply to local; overleaf uses it.",
    );
    expect(harness.editor.web.account.compiles).toHaveLength(0);
  });
});
