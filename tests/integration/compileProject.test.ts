import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shouldRunTexTests } from "../support/texAvailability.js";

import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { McpStdioClient } from "./mcpStdioClient.js";

const compilablePaper = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "Hello.",
  "\\end{document}",
].join("\n");

const brokenPaper = ["\\documentclass{article}", "\\begin{document}", "\\undefinedcommand"].join("\n");

// latexmk and a TeX distribution are optional dependencies of this project, so these
// tests describe themselves as skipped rather than failing on a machine without them.
const describeWithLatex = describe.runIf(await shouldRunTexTests());

describeWithLatex("compile_project", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeAll(async () => {
    remote = await FakeOverleafRemote.create("94a1b2c3d4e5f6a7b8c9d0e1");
    await remote.collaboratorPushes("main.tex", compilablePaper, "Initial draft");
    client = await McpStdioClient.start(remote.environment());
  });

  afterAll(async () => {
    await client.stop();
    remote.cleanUp();
  });

  it("compiles a healthy document and says where the PDF is", async () => {
    const report = await client.call("compile_project");
    expect(report).toContain("Compiled main.tex.");
    const pdfPath = join(remote.workspaceDirectory, ".build", remote.projectId, "main.pdf");
    expect(report).toContain(`The PDF is at ${pdfPath}.`);
  });

  // Build artifacts must never end up staged and pushed into a co-author's project.
  it("leaves no build artifacts inside the clone", async () => {
    await client.call("compile_project");
    const cloneDirectory = join(remote.workspaceDirectory, remote.projectId);
    const entries = await readdir(cloneDirectory);

    expect(entries).not.toContain("main.pdf");
    expect(entries.filter((name) => name.endsWith(".aux"))).toEqual([]);
    expect(entries.filter((name) => name.endsWith(".log"))).toEqual([]);
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  });

  it("reports the errors when the document does not build", async () => {
    await client.call("edit_file", { action: "write", path: "main.tex", content: brokenPaper });
    const report = await client.call("compile_project");

    expect(report).toContain("FAILED to compile main.tex.");
    expect(report).toContain("errors:");
    // The PDF from the healthy build belongs to an earlier version of the paper.
    expect(report).not.toContain("The PDF is at");
    await client.call("manage_files", { action: "discard_local_changes" });
  });

  // The first pass always warns that every citation and reference is undefined, because no
  // .aux exists yet. Overleaf only shows the final pass, and neither should this.
  it("reports only what the final pass still warns about", async () => {
    const citedAndReferenced = [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\section{Intro}\\label{sec:intro}",
      "See \\cite{knuth1984} and Section~\\ref{sec:intro}; \\cite{nobody2000} has no entry.",
      "\\begin{thebibliography}{1}",
      "\\bibitem{knuth1984} D. Knuth. Literate programming. 1984.",
      "\\end{thebibliography}",
      "\\end{document}",
    ].join("\n");
    await client.call("edit_file", { action: "write", path: "main.tex", content: citedAndReferenced });
    const report = await client.call("compile_project");

    expect(report).toContain("Compiled main.tex.");
    expect(report).toContain("Citation `nobody2000' on page 1 undefined");
    expect(report).not.toContain("knuth1984");
    expect(report).not.toContain("Reference `sec:intro'");
    expect(report).not.toContain("Rerun to get cross-references right");
    await client.call("manage_files", { action: "discard_local_changes" });
  });

  it("explains itself when handed an included fragment", async () => {
    await client.call("edit_file", {
      action: "write",
      path: "fragment.tex",
      content: "\\section{Just a piece}\n",
    });
    expect(await client.call("compile_project", { mainTexFile: "fragment.tex" })).toContain(
      "no \\begin{document}",
    );
    await client.call("manage_files", { action: "discard_local_changes" });
  });
});
