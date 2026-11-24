import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { shouldRunTexTests } from "../../support/texAvailability.js";
import { LIVE_PROJECT_NAME, LiveOverleafServer, liveRunIdentifier } from "../support/liveOverleafServer.js";
import { liveGitBridgeConfigured } from "../support/liveOverleafSettings.js";
import { callFailing, callSucceeding, listedFilePaths, pushedCommitHash } from "../support/liveToolCalls.js";
import { isProgramOnPath } from "../support/programOnPath.js";

const texAvailable = await shouldRunTexTests();
const texcountAvailable = await isProgramOnPath("texcount");
const runIdentifier = liveRunIdentifier();
const SCRATCH_ROOT_OF_EVERY_RUN = "mcp-e2e/";
const scratchFolder = `${SCRATCH_ROOT_OF_EVERY_RUN}${runIdentifier}`;
const paperPath = `${scratchFolder}/paper.tex`;
const bibliographyPath = `${scratchFolder}/refs.bib`;
const figurePath = `${scratchFolder}/figure.png`;
const appendedLine = `% appended by run ${runIdentifier}`;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const firstDraft = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  `Run ${runIdentifier}. The sample size is 5000.`,
  "\\label{sec:intro}",
  "Deep networks~\\cite{lecun2015deep} are covered in Section~\\ref{sec:intro}.",
  "\\section{Conclusion}",
  "Original ending.",
  "\\bibliographystyle{plain}",
  `\\bibliography{${scratchFolder}/refs}`,
  "\\end{document}",
  "",
].join("\n");

const bibliography = [
  "@article{lecun2015deep,",
  "  title = {Deep learning},",
  "  author = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},",
  "  journal = {Nature},",
  "  year = {2015},",
  "  doi = {10.1038/nature14539},",
  "}",
  "",
].join("\n");

describe.skipIf(!liveGitBridgeConfigured)("the Git bridge tools against a live Overleaf project", () => {
  let server: LiveOverleafServer;
  let firstDraftCommit = "";
  let editsCommit = "";
  const call = (toolName: string, toolArguments: Record<string, unknown> = {}) =>
    callSucceeding(server.client, toolName, { project: LIVE_PROJECT_NAME, ...toolArguments });
  const pendingChanges = () => call("read_project", { view: "changes" });
  const listFiles = () => call("read_project", { view: "files" });
  const discardLocalChanges = () => call("manage_files", { action: "discard_local_changes" });

  beforeAll(async () => {
    server = await LiveOverleafServer.start("gitBridgeAndEditor");
  });

  afterAll(async () => {
    if (!server) return;
    try {
      await discardLocalChanges();
      const scratchPathsLeftByAnyRun = listedFilePaths(await listFiles()).filter((path) =>
        path.startsWith(SCRATCH_ROOT_OF_EVERY_RUN),
      );
      for (const path of scratchPathsLeftByAnyRun) await call("manage_files", { action: "delete", path });
      if (scratchPathsLeftByAnyRun.length > 0) {
        await call("push_changes", { commitMessage: `Remove end-to-end scratch files ${runIdentifier}` });
      }
    } finally {
      await server.stop();
    }
  });

  it("lists the registered project and clones it", async () => {
    expect(await call("list_projects", {})).toContain(LIVE_PROJECT_NAME);
    expect(await call("read_project", { view: "status" })).not.toContain("WARNING");
    expect(await listFiles()).not.toBe("");
  });

  it("keeps new files local until push_changes, then publishes them", async () => {
    await call("edit_file", { action: "write", path: paperPath, content: firstDraft });
    await call("edit_file", { action: "write", path: bibliographyPath, content: bibliography });
    expect(await pendingChanges()).toContain(runIdentifier);

    const pushReply = await call("push_changes", {
      commitMessage: `End-to-end first draft ${runIdentifier}`,
    });
    firstDraftCommit = pushedCommitHash(pushReply);
    expect(await pendingChanges()).toContain("No local changes pending.");
    expect(await call("read_history", { path: paperPath })).toContain(
      `End-to-end first draft ${runIdentifier}`,
    );
  });

  it("reads, outlines and searches the published paper", async () => {
    expect(await call("read_file", { path: paperPath })).toContain("The sample size is 5000.");
    const sections = await call("read_project", { view: "outline", path: paperPath });
    expect(sections).toContain("Introduction");
    expect(sections).toContain("Conclusion");
    expect(await call("read_file", { path: paperPath, sectionTitle: "Conclusion" })).toContain(
      "Original ending.",
    );
    expect(await call("search_project", { query: runIdentifier })).toContain(paperPath);
    expect(await call("read_project", { view: "overview" })).not.toBe("");
  });

  it("refuses a snippet that is missing, and changes nothing", async () => {
    expect(
      await callFailing(server.client, "edit_file", {
        action: "replace_text",
        project: LIVE_PROJECT_NAME,
        path: paperPath,
        findText: "text that is not in the paper",
        replaceWith: "anything",
      }),
    ).toContain("Nothing was changed.");
    expect(await pendingChanges()).toContain("No local changes pending.");
  });

  it("edits a snippet and a section, and publishes both in one commit", async () => {
    await call("edit_file", {
      action: "replace_text",
      path: paperPath,
      findText: "5000",
      replaceWith: "8000",
    });
    await call("edit_file", {
      action: "replace_section",
      path: paperPath,
      sectionTitle: "Conclusion",
      content: "\\section{Conclusion}\nRewritten ending.\n",
    });
    await call("edit_file", { action: "append", path: paperPath, content: appendedLine });
    const pending = await pendingChanges();
    expect(pending).toContain("8000");
    expect(pending).toContain("Rewritten ending.");
    expect(pending).toContain(appendedLine);

    editsCommit = pushedCommitHash(
      await call("push_changes", { commitMessage: `End-to-end edits ${runIdentifier}` }),
    );
    const published = await call("read_file", { path: paperPath });
    expect(published).toContain("8000");
    expect(published).toContain("Rewritten ending.");
    expect(published.trimEnd().endsWith(appendedLine)).toBe(true);
  });

  it("reads the paper's history as commits, a diff and a blame", async () => {
    const commits = await call("read_history", { view: "commits", path: paperPath, limit: 5 });
    expect(commits).toContain(`End-to-end first draft ${runIdentifier}`);
    expect(commits).toContain(`End-to-end edits ${runIdentifier}`);

    const diff = await call("read_history", {
      view: "diff",
      path: paperPath,
      fromRevision: firstDraftCommit,
      toRevision: editsCommit,
    });
    expect(diff).toContain("8000");
    expect(diff).toContain("Original ending.");

    const blame = await call("read_history", { view: "blame", path: paperPath });
    const rewrittenLine = blame.split("\n").find((line) => line.endsWith("\tRewritten ending."));
    expect(rewrittenLine).toContain(editsCommit.slice(0, 7));
  });

  it("shows the first draft from history and restores it", async () => {
    expect(await call("read_file", { path: paperPath, revision: firstDraftCommit })).toContain("5000");
    await call("manage_files", { action: "restore", path: paperPath, revision: firstDraftCommit });
    expect(await call("read_file", { path: paperPath })).toContain("5000");
    await discardLocalChanges();
    expect(await call("read_file", { path: paperPath })).toContain("8000");
  });

  it("uploads a binary file from this computer", async () => {
    const localFigure = join(server.scratchDirectory, "figure.png");
    writeFileSync(localFigure, PNG_SIGNATURE);
    expect(
      await call("manage_files", { action: "upload", path: figurePath, sourcePath: localFigure }),
    ).toContain(`Added ${figurePath}`);
    await call("push_changes", { commitMessage: `End-to-end figure ${runIdentifier}` });
    expect(await listFiles()).toContain(figurePath);
  });

  it("uploads a folder from this computer, keeping its subfolder", async () => {
    const localFolder = join(server.scratchDirectory, "figures");
    mkdirSync(join(localFolder, "raw"), { recursive: true });
    writeFileSync(join(localFolder, "plot.png"), PNG_SIGNATURE);
    writeFileSync(join(localFolder, "raw", "data.csv"), "x,y\n1,2\n");
    const uploadedFolder = `${scratchFolder}/figures`;
    const reply = await call("manage_files", {
      action: "upload_folder",
      path: uploadedFolder,
      sourcePath: localFolder,
    });
    expect(reply).toContain(`- ${uploadedFolder}/plot.png (added, 8 bytes)`);
    expect(reply).toContain(`- ${uploadedFolder}/raw/data.csv (added, 8 bytes)`);
    await call("push_changes", { commitMessage: `End-to-end folder ${runIdentifier}` });
    const files = await listFiles();
    expect(files).toContain(`${uploadedFolder}/plot.png`);
    expect(files).toContain(`${uploadedFolder}/raw/data.csv`);
  });

  it("moves a file locally and discards the move", async () => {
    await call("manage_files", { action: "move", path: figurePath, toPath: `${scratchFolder}/moved.png` });
    expect(await pendingChanges()).toContain("moved.png");
    await discardLocalChanges();
    expect(await listFiles()).toContain(figurePath);
  });

  it("finds every label, reference and citation defined", async () => {
    expect(await call("check_references", { mainTexFile: paperPath })).toContain(
      `Checked ${paperPath} with ${bibliographyPath}: no problems found.`,
    );
  });

  it("confirms the cited work exists with doi.org, Crossref and arXiv", async () => {
    const report = await call("look_up_citations", { action: "verify", mainTexFile: paperPath });
    expect(report).toContain("no entry points at the wrong work.");
    expect(report).toContain("Confirmed (1): lecun2015deep (DOI)");
  });

  it("turns a DOI into a BibTeX entry with Crossref", async () => {
    const found = await call("look_up_citations", { action: "find", queries: ["10.1038/nature14539"] });
    expect(found).toContain("1 found");
    expect(found).toMatch(/@article\{/i);
    expect(found).toContain("Deep learning");
  });

  it.runIf(texcountAvailable)("counts the paper's words with texcount", async () => {
    expect(await call("read_project", { view: "word_count", path: paperPath })).toContain(
      `texcount's word count for ${paperPath}`,
    );
  });

  it.runIf(texAvailable)("compiles the paper locally with latexmk", async () => {
    expect(await call("compile_project", { mainTexFile: paperPath })).toContain(`Compiled ${paperPath}.`);
  });
});
