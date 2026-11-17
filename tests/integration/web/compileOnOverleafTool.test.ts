import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  let downloadDirectory: string;

  beforeEach(() => {
    downloadDirectory = mkdtempSync(join(tmpdir(), "overleaf-compile-"));
  });

  afterEach(() => {
    rmSync(downloadDirectory, { recursive: true, force: true });
  });

  it("compiles with the editor's request and reports a clean build", async () => {
    const client = await harness.startClient();
    const report = await client.call("compile_on_overleaf", {});
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
    await client.call("compile_on_overleaf", { mainTexFile: "thesis.tex", draft: true });
    expect(harness.editor.web.account.compiles[0]?.body).toMatchObject({
      rootResourcePath: "thesis.tex",
      draft: true,
    });
  });

  it("reports errors and warnings from the log even when a PDF was produced", async () => {
    harness.editor.web.account.compileLog = LOG_WITH_ERRORS;
    const client = await harness.startClient();
    const report = await client.call("compile_on_overleaf", {});
    expect(report).toContain("Compiled on Overleaf with 1 error; a PDF was still produced.");
    expect(report).toContain("./main.tex:3: Undefined control sequence.");
    expect(report).toContain("LaTeX Warning: Reference `fig:missing' on page 1 undefined");
  });

  it("says no PDF was produced on failure, with the end of the log", async () => {
    harness.editor.web.account.compileStatus = "failure";
    harness.editor.web.account.producesPdf = false;
    harness.editor.web.account.compileLog = "Emergency stop.\nNo pages of output.";
    const client = await harness.startClient();
    const report = await client.call("compile_on_overleaf", {
      savePdfTo: join(downloadDirectory, "paper.pdf"),
    });
    expect(report).toContain("FAILED to compile on Overleaf: no PDF was produced.");
    expect(report).toContain("No pages of output.");
    expect(report).toContain("No PDF was produced, so nothing was saved.");
  });

  it("explains a status the editor would show as a banner", async () => {
    harness.editor.web.account.compileStatus = "timedout";
    harness.editor.web.account.producesPdf = false;
    const client = await harness.startClient();
    const report = await client.call("compile_on_overleaf", {});
    expect(report).toContain('Overleaf did not compile the project (status "timedout").');
    expect(report).toContain("time limit");
  });

  it("waits out one too-recently-compiled refusal and compiles", async () => {
    harness.editor.web.account.refuseCompilesAsTooRecent = 1;
    const client = await harness.startClient();
    const report = await client.call("compile_on_overleaf", {});
    expect(report).toContain("Compiled on Overleaf.");
    expect(harness.editor.web.account.compiles).toHaveLength(2);
  });

  it("saves the PDF where asked, fetched from the web origin with the compile server's routing", async () => {
    const target = join(downloadDirectory, "paper.pdf");
    const client = await harness.startClient();
    const report = await client.call("compile_on_overleaf", { savePdfTo: target });
    expect(report).toContain(`Saved the PDF (${FAKE_PDF_BYTES.length} bytes) to ${target}.`);
    expect(readFileSync(target)).toEqual(FAKE_PDF_BYTES);
    expect(harness.editor.web.account.outputDownloads).toEqual(["output.log", "output.pdf"]);
  });

  it("replaces an earlier PDF but never a file of another kind", async () => {
    const earlierPdf = join(downloadDirectory, "earlier.pdf");
    writeFileSync(earlierPdf, "%PDF-1.4 older build");
    const notAPdf = join(downloadDirectory, "notes.pdf");
    writeFileSync(notAPdf, "my notes, misnamed");
    const client = await harness.startClient();

    await client.call("compile_on_overleaf", { savePdfTo: earlierPdf });
    expect(readFileSync(earlierPdf)).toEqual(FAKE_PDF_BYTES);

    const refused = await client.call("compile_on_overleaf", { savePdfTo: notAPdf });
    expect(refused).toContain("already exists and is not a PDF");
    expect(readFileSync(notAPdf, "utf8")).toBe("my notes, misnamed");
  });

  it("refuses a relative path or a wrong extension", async () => {
    const client = await harness.startClient();
    expect(await client.call("compile_on_overleaf", { savePdfTo: "paper.pdf" })).toContain("absolute path");
    expect(
      await client.call("compile_on_overleaf", { savePdfTo: join(downloadDirectory, "paper.txt") }),
    ).toContain("must end in .pdf");
  });
});
