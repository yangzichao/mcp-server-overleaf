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

  it("compiles a healthy document", async () => {
    expect(await client.call("compile_project")).toContain("Compiled main.tex.");
  });

  // Build artifacts must never end up staged and pushed into a co-author's project.
  it("leaves no build artifacts inside the clone", async () => {
    await client.call("compile_project");
    const cloneDirectory = join(remote.workspaceDirectory, remote.projectId);
    const entries = await readdir(cloneDirectory);

    expect(entries).not.toContain("main.pdf");
    expect(entries.filter((name) => name.endsWith(".aux"))).toEqual([]);
    expect(entries.filter((name) => name.endsWith(".log"))).toEqual([]);
    expect(await client.call("show_diff")).toBe("No local changes pending.");
  });

  it("reports the errors when the document does not build", async () => {
    await client.call("write_file", { path: "main.tex", content: brokenPaper });
    const report = await client.call("compile_project");

    expect(report).toContain("FAILED to compile main.tex.");
    expect(report).toContain("errors:");
    await client.call("discard_local_changes");
  });

  it("explains itself when handed an included fragment", async () => {
    await client.call("write_file", { path: "fragment.tex", content: "\\section{Just a piece}\n" });
    expect(await client.call("compile_project", { mainTexFile: "fragment.tex" })).toContain(
      "no \\begin{document}",
    );
    await client.call("discard_local_changes");
  });
});
