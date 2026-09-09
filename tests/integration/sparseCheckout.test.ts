import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldRunTexTests } from "../support/texAvailability.js";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { McpStdioClient } from "./mcpStdioClient.js";

const hasTex = await shouldRunTexTests();
const paper = "\\documentclass{article}\n\\begin{document}\n\\input{data/content.dat}\n\\end{document}\n";
let remote: FakeOverleafRemote;
let client: McpStdioClient;
const clonePath = (path: string) => join(remote.workspaceDirectory, remote.projectId, path);
const sparseEnvironment = () => ({ ...remote.environment(), OVERLEAF_MCP_CHECKOUT_MODE: "text-only" });

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", paper, "Initial draft");
  await remote.collaboratorPushes("sections/part.tex", "\\section{Included}\n", "Nested section");
  await remote.collaboratorPushes("data/content.dat", "Compiled content.\n", "Compilation input");
  await remote.collaboratorPushes("figure.png", "\0unchanged image data", "Figure");
  client = await McpStdioClient.start(sparseEnvironment());
});
afterEach(async () => {
  await client?.stop();
  remote?.cleanUp();
});

describe("text-only checkout", () => {
  it("keeps omitted files tracked and preserves them when publishing a text edit", async () => {
    expect(await client.call("list_files")).toContain("figure.png");
    expect(existsSync(clonePath("figure.png"))).toBe(false);
    expect(existsSync(clonePath("sections/part.tex"))).toBe(true);
    await client.call("replace_text", {
      path: "sections/part.tex",
      findText: "Included",
      replaceWith: "Edited",
    });
    expect(await client.call("push_changes", { commitMessage: "Sparse edit" })).toContain("Pushed");
    expect(await remote.readPublishedFile("figure.png")).toBe("\0unchanged image data");
    expect(await remote.readPublishedFile("sections/part.tex")).toContain("Edited");
    expect(existsSync(clonePath("figure.png"))).toBe(false);
  });

  it("expands for a skipped file without losing dirty text, and keeps expansion after restart", async () => {
    await client.call("replace_text", { path: "main.tex", findText: "article", replaceWith: "report" });
    expect(await client.call("read_file", { path: "data/content.dat" })).toBe("Compiled content.\n");
    expect(await readFile(clonePath("main.tex"), "utf8")).toContain("report");
    expect(existsSync(clonePath("figure.png"))).toBe(true);
    await client.stop();
    client = await McpStdioClient.start(sparseEnvironment());
    expect(await client.call("show_diff")).toContain("report");
    expect(existsSync(clonePath("figure.png"))).toBe(true);
  });

  /**
   * Expansion is permanent, so it must be reserved for the case it exists for: a file Git
   * is tracking that sparse checkout skipped. A path that is not in the index at all is
   * either a typo or a file about to be created, and expanding for either of those turns
   * text-only mode off for the whole project without anyone asking for it.
   */
  it("does not expand for a path Git is not tracking", async () => {
    await client.call("list_files");
    expect(existsSync(clonePath("figure.png"))).toBe(false);

    expect((await client.callRaw("read_file", { path: "main.txe" })).result?.isError).toBe(true);
    expect(existsSync(clonePath("figure.png"))).toBe(false);

    await client.call("write_file", { path: "notes.tex", content: "A new local note.\n" });
    expect(existsSync(clonePath("figure.png"))).toBe(false);

    expect(await client.call("push_changes", { commitMessage: "Add a note" })).toContain("Pushed");
    expect(await remote.readPublishedFile("notes.tex")).toBe("A new local note.\n");
    expect(await remote.readPublishedFile("figure.png")).toBe("\0unchanged image data");
  });

  it("refuses contraction of a dirty full checkout and can recover with the previous configuration", async () => {
    await client.stop();
    client = await McpStdioClient.start(remote.environment());
    await client.call("list_files");
    await writeFile(clonePath("figure.png"), "\0local image changes");
    await client.stop();
    client = await McpStdioClient.start(sparseEnvironment());
    expect((await client.callRaw("list_files")).result?.isError).toBe(true);
    expect(await readFile(clonePath("figure.png"), "utf8")).toBe("\0local image changes");
    await client.stop();
    client = await McpStdioClient.start(remote.environment());
    expect(await client.call("show_diff")).toContain("figure.png");
  });

  it.runIf(hasTex)("materializes every compilation input before running real latexmk", async () => {
    await client.call("list_files");
    expect(existsSync(clonePath("data/content.dat"))).toBe(false);
    expect(await client.call("compile_project")).toContain("Compiled main.tex.");
    expect(existsSync(clonePath("data/content.dat"))).toBe(true);
    expect(await client.call("show_diff")).toBe("No local changes pending.");
  });

  it("preserves ignored local files when a clean-looking clone changes to text-only", async () => {
    await client.stop();
    client = await McpStdioClient.start(remote.environment());
    await client.call("list_files");
    await mkdir(clonePath("private-output"));
    await writeFile(clonePath("private-output/notes.log"), "Local work that Git ignores");
    expect(await client.call("show_diff")).toBe("No local changes pending.");
    await client.stop();
    client = await McpStdioClient.start(sparseEnvironment());
    expect((await client.callRaw("list_files")).result?.isError).toBe(true);
    expect(await readFile(clonePath("private-output/notes.log"), "utf8")).toBe("Local work that Git ignores");
  });
});
