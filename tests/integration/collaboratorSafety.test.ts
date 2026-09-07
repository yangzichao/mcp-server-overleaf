import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { McpStdioClient } from "./mcpStdioClient.js";

const originalPaper = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "The sample size is 5000.",
  "\\section{Conclusion}",
  "Placeholder.",
  "\\end{document}",
].join("\n");

let remote: FakeOverleafRemote;
let client: McpStdioClient;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", originalPaper, "Initial draft");
  client = await McpStdioClient.start(remote.environment());
});

afterEach(() => {
  client.stop();
  remote.cleanUp();
});

describe("the server as a client sees it", () => {
  it("advertises the whole tool set over the protocol", async () => {
    const names = await client.listToolNames();
    expect(names).toEqual(
      expect.arrayContaining([
        "list_projects",
        "list_files",
        "read_file",
        "list_sections",
        "read_section",
        "search_project",
        "replace_text",
        "edit_section",
        "write_file",
        "show_diff",
        "discard_local_changes",
        "project_status",
        "sync_project",
        "compile_project",
        "push_changes",
      ]),
    );
  });

  it("clones on first use and reads the project", async () => {
    expect(await client.call("list_files")).toContain("main.tex");
    expect(await client.call("read_file", { path: "main.tex" })).toContain("The sample size is 5000.");
  });
});

describe("edits stay local until they are pushed", () => {
  it("does not touch Overleaf when a file is edited", async () => {
    await client.call("replace_text", {
      path: "main.tex",
      findText: "5000",
      replaceWith: "8000",
    });

    expect(await client.call("show_diff")).toContain("8000");
    expect(await remote.readPublishedFile("main.tex")).toContain("5000");
    expect(await remote.readPublishedFile("main.tex")).not.toContain("8000");
  });

  it("publishes only once push_changes is called", async () => {
    await client.call("replace_text", { path: "main.tex", findText: "5000", replaceWith: "8000" });
    const report = await client.call("push_changes", { commitMessage: "Correct the sample size" });

    expect(report).toContain("Pushed to Overleaf");
    expect(await remote.readPublishedFile("main.tex")).toContain("8000");
    expect(await remote.publishedCommitSubjects()).toContain("Correct the sample size");
  });

  it("throws local edits away on request", async () => {
    await client.call("replace_text", { path: "main.tex", findText: "5000", replaceWith: "8000" });
    await client.call("discard_local_changes");

    expect(await client.call("show_diff")).not.toContain("8000");
    expect(await client.call("read_file", { path: "main.tex" })).toContain("5000");
  });

  it("reports nothing to push when no edit was made", async () => {
    expect(await client.call("push_changes", { commitMessage: "empty" })).toContain("Nothing to push");
  });
});

describe("a co-author editing at the same time", () => {
  it("pulls their work in before a read", async () => {
    await remote.collaboratorPushes(
      "main.tex",
      originalPaper.replace("Placeholder.", "Written by the co-author."),
      "Co-author fills in the conclusion",
    );

    expect(await client.call("read_file", { path: "main.tex" })).toContain("Written by the co-author.");
  });

  it("rebases a non-conflicting edit on top of theirs", async () => {
    await client.call("edit_section", {
      path: "main.tex",
      sectionTitle: "Conclusion",
      newContent: "\\section{Conclusion}\nOur own ending.",
    });
    await remote.collaboratorPushes(
      "notes.tex",
      "A file only the co-author touched.\n",
      "Co-author adds notes",
    );

    expect(await client.call("push_changes", { commitMessage: "Rewrite the conclusion" })).toContain(
      "Pushed to Overleaf",
    );
    expect(await remote.readPublishedFile("main.tex")).toContain("Our own ending.");
    expect(await remote.readPublishedFile("notes.tex")).toContain("only the co-author touched");
  });

  // The property the whole project exists for.
  it("refuses the push when both changed the same line, and loses nothing", async () => {
    await client.call("replace_text", { path: "main.tex", findText: "5000", replaceWith: "8000" });
    await remote.collaboratorPushes(
      "main.tex",
      originalPaper.replace("5000", "20000"),
      "Co-author corrects the sample size",
    );

    const report = await client.call("push_changes", { commitMessage: "Our own correction" });
    expect(report).toContain("Push refused");

    const published = await remote.readPublishedFile("main.tex");
    expect(published).toContain("20000");
    expect(published).not.toContain("8000");
    expect(await remote.publishedCommitSubjects()).not.toContain("Our own correction");
  });

  it("leaves the clone usable after a refused push", async () => {
    await client.call("replace_text", { path: "main.tex", findText: "5000", replaceWith: "8000" });
    await remote.collaboratorPushes(
      "main.tex",
      originalPaper.replace("5000", "20000"),
      "Co-author corrects the sample size",
    );
    await client.call("push_changes", { commitMessage: "Our own correction" });

    expect(await client.call("project_status")).toContain("branch:");
    expect(await client.call("list_files")).toContain("main.tex");
  });
});

describe("paths the model must not reach", () => {
  it("refuses to read outside the project", async () => {
    expect(await client.call("read_file", { path: "../../../../etc/passwd" })).toContain(
      "outside the project",
    );
  });

  it("refuses an absolute path", async () => {
    expect(await client.call("write_file", { path: "/tmp/pwned.tex", content: "x" })).toContain(
      "must be relative",
    );
  });

  it("refuses to write into .git", async () => {
    expect(await client.call("write_file", { path: ".git/config", content: "x" })).toContain(
      ".git directory",
    );
  });
});

describe("secret handling", () => {
  it("never prints the token, even when git fails", async () => {
    const token = remote.environment().OVERLEAF_GIT_TOKEN ?? "";
    const outputs = [
      await client.call("read_file", { path: "does-not-exist.tex" }),
      await client.call("project_status"),
      await client.call("list_files"),
      client.stderr,
    ];
    for (const output of outputs) expect(output).not.toContain(token);
  });
});
