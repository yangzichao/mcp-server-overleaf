import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRealtime } from "./fakeOverleafRealtime.js";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { McpStdioClient } from "./mcpStdioClient.js";

/**
 * The review tools through the MCP protocol, against both fakes at once: the Git bridge the
 * other sixteen tools use, and the editor connection these three use.
 */

const PAPER = "\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}";

const REVIEW_TOOL_NAMES = ["list_tracked_changes", "suggest_edit", "add_comment"];

describe("the review tools", () => {
  let gitRemote: FakeOverleafRemote;
  let editor: FakeOverleafRealtime;
  let client: McpStdioClient | undefined;
  let mainDocumentId: string;

  beforeEach(async () => {
    gitRemote = await FakeOverleafRemote.create();
    await gitRemote.collaboratorPushes("main.tex", PAPER, "Initial draft");
    editor = await FakeOverleafRealtime.start(gitRemote.projectId);
    mainDocumentId = editor.addDocument("main.tex", PAPER);
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    await editor.stop();
    gitRemote.cleanUp();
  });

  function reviewEnvironment(): NodeJS.ProcessEnv {
    return {
      ...gitRemote.environment(),
      OVERLEAF_SESSION_COOKIE: editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: editor.baseUrl,
    };
  }

  it("is not offered at all when no session cookie is configured", async () => {
    client = await McpStdioClient.start(gitRemote.environment());
    const names = await client.listToolNames();
    for (const toolName of REVIEW_TOOL_NAMES) expect(names).not.toContain(toolName);
    expect(names).toContain("replace_text");
  });

  it("is offered once a session cookie is configured", async () => {
    client = await McpStdioClient.start(reviewEnvironment());
    const names = await client.listToolNames();
    for (const toolName of REVIEW_TOOL_NAMES) expect(names).toContain(toolName);
  });

  it("reports a document with nothing to review", async () => {
    client = await McpStdioClient.start(reviewEnvironment());
    const answer = await client.call("list_tracked_changes", { path: "main.tex" });
    expect(answer).toContain("No tracked changes in main.tex.");
  });

  it("turns an edit into a suggestion and then reads it back with a line number", async () => {
    client = await McpStdioClient.start(reviewEnvironment());
    const suggestion = await client.call("suggest_edit", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Hello, brave new world.",
    });
    expect(suggestion).toContain("review panel");

    const listed = await client.call("list_tracked_changes", { path: "main.tex" });
    expect(listed).toContain("2 tracked changes in main.tex");
    expect(listed).toContain('line 3: delete "Hello world."');
    expect(listed).toContain('line 3: insert "Hello, brave new world."');
  });

  it("refuses a suggestion whose text appears twice rather than picking one", async () => {
    const repeatsDocumentId = editor.addDocument("repeats.tex", "the same line\nthe same line\n");
    client = await McpStdioClient.start(reviewEnvironment());
    const answer = await client.call("suggest_edit", {
      path: "repeats.tex",
      findText: "the same line",
      replaceWith: "a different line",
    });
    expect(answer).toContain("appears more than once");
    expect(editor.trackedChanges(repeatsDocumentId)).toHaveLength(0);
  });

  it("names the documents that exist when the path is wrong", async () => {
    client = await McpStdioClient.start(reviewEnvironment());
    const answer = await client.call("list_tracked_changes", { path: "nope.tex" });
    expect(answer).toContain('No editable document at "nope.tex"');
    expect(answer).toContain("main.tex");
  });

  it("refuses a suggestion on a read-only project before sending anything", async () => {
    editor.permissionsLevel = "readOnly";
    client = await McpStdioClient.start(reviewEnvironment());
    const answer = await client.call("suggest_edit", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Goodbye world.",
    });
    expect(answer).toContain("read-only access");
    expect(editor.trackedChanges(mainDocumentId)).toHaveLength(0);
  });

  it("anchors a comment thread and lists it against the quoted passage", async () => {
    client = await McpStdioClient.start(reviewEnvironment());
    const anchored = await client.call("add_comment", {
      path: "main.tex",
      quoteText: "Hello world.",
    });
    expect(anchored).toContain("Anchored a comment thread");

    const listed = await client.call("list_tracked_changes", { path: "main.tex" });
    expect(listed).toContain("1 comment thread:");
    expect(listed).toContain('line 3, on "Hello world."');
    expect(listed).toContain("open the review panel in Overleaf to read them");
  });

  it("leaves the Git-bridge tools reading the bridge, not the editor", async () => {
    client = await McpStdioClient.start(reviewEnvironment());
    await client.call("suggest_edit", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Hello, brave new world.",
    });
    // The suggestion lives in the editor. The Git bridge still holds the accepted text, which
    // is exactly the distinction these tools exist to make.
    const viaGit = await client.call("read_file", { path: "main.tex" });
    expect(viaGit).toContain("Hello world.");
    expect(viaGit).not.toContain("brave new world");
  });
});
