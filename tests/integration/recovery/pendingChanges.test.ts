import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

const originalPaper = "\\section{Introduction}\nThe sample size is 5000.\n";
let remote: FakeOverleafRemote;
let client: McpStdioClient;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", originalPaper, "Initial draft");
  client = await McpStdioClient.start(remote.environment());
});

afterEach(async () => {
  await client.stop();
  remote.cleanUp();
});

describe("reviewing all unpublished work", () => {
  it("shows new files without staging them or changing the remote", async () => {
    await client.call("write_file", { path: "章节/new file.tex", content: "A new chapter.\n" });
    const diff = await client.call("show_diff");
    expect(diff).toContain("A new chapter.");
    expect(diff).toContain("new file.tex");
    expect(await client.call("project_status")).toContain("??");
    expect(await remote.publishedCommitSubjects()).toEqual(["Initial draft"]);
  });

  it("keeps a refused commit visible and supports discard, re-edit and publish", async () => {
    await client.call("replace_text", { path: "main.tex", findText: "5000", replaceWith: "8000" });
    await remote.collaboratorPushes("main.tex", originalPaper.replace("5000", "20000"), "Their correction");
    const refused = await client.callRaw("push_changes", { commitMessage: "Our correction" });
    expect(refused.result?.isError).toBe(true);
    expect(await client.call("show_diff")).toContain("+The sample size is 8000.");
    expect(await client.call("discard_local_changes")).toContain("1 unpushed commit");
    expect(await client.call("read_file", { path: "main.tex" })).toContain("20000");
    expect(await client.call("show_diff")).toBe("No local changes pending.");
    await client.call("replace_text", { path: "main.tex", findText: "20000", replaceWith: "21000" });
    expect(await client.call("push_changes", { commitMessage: "Reviewed correction" })).toContain("Pushed");
    expect(await remote.readPublishedFile("main.tex")).toContain("21000");
    expect(await remote.publishedCommitSubjects()).not.toContain("Our correction");
  });
});

describe("synchronization with unpublished edits", () => {
  beforeEach(async () => {
    await client.call("replace_text", { path: "main.tex", findText: "5000", replaceWith: "8000" });
    await remote.collaboratorPushes("notes.tex", "Collaborator notes.\n", "Add notes");
  });

  it("reports a blocked sync instead of claiming the clone is current", async () => {
    const response = await client.callRaw("sync_project");
    expect(response.result?.isError).toBe(true);
    expect(JSON.stringify(response)).not.toContain("Up to date");
    expect(await client.call("project_status")).toContain("commits on Overleaf not yet merged in: 1");
  });

  it("refuses stale reads and edits while preserving both versions", async () => {
    expect((await client.callRaw("read_file", { path: "main.tex" })).result?.isError).toBe(true);
    expect(
      (await client.callRaw("write_file", { path: "main.tex", content: "Overwrite" })).result?.isError,
    ).toBe(true);
    expect(await readFile(join(remote.workspaceDirectory, remote.projectId, "main.tex"), "utf8")).toContain(
      "8000",
    );
    expect(await remote.readPublishedFile("main.tex")).toContain("5000");
    expect(await remote.readPublishedFile("notes.tex")).toContain("Collaborator notes.");
  });

  it("can publish the existing edit and then read the collaborator's file", async () => {
    expect(await client.call("push_changes", { commitMessage: "Our correction" })).toContain("Pushed");
    expect(await client.call("read_file", { path: "notes.tex" })).toContain("Collaborator notes.");
    expect(await remote.readPublishedFile("main.tex")).toContain("8000");
  });
});
