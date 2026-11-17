import { describe, expect, it } from "vitest";

import { REVIEW_TOOL_NAMES, useReviewTestHarness } from "./reviewTestHarness.js";

/**
 * The review tools through the MCP protocol: which are offered, and the suggestion half of
 * them. Comments and decisions have their own files.
 */

describe("the review tools", () => {
  const harness = useReviewTestHarness();

  it("is not offered at all when no session cookie is configured", async () => {
    const client = await harness.startClient(harness.gitRemote.environment());
    const names = await client.listToolNames();
    for (const toolName of REVIEW_TOOL_NAMES) expect(names).not.toContain(toolName);
    expect(names).toContain("replace_text");
  });

  it("is offered once a session cookie is configured", async () => {
    const client = await harness.startClient();
    const names = await client.listToolNames();
    for (const toolName of REVIEW_TOOL_NAMES) expect(names).toContain(toolName);
  });

  it("reports a document with nothing to review", async () => {
    const client = await harness.startClient();
    const answer = await client.call("list_tracked_changes", { path: "main.tex" });
    expect(answer).toContain("No tracked changes in main.tex.");
  });

  it("turns an edit into a suggestion and then reads it back with a line number", async () => {
    const client = await harness.startClient();
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
    const repeatsDocumentId = harness.editor.addDocument("repeats.tex", "the same line\nthe same line\n");
    const client = await harness.startClient();
    const answer = await client.call("suggest_edit", {
      path: "repeats.tex",
      findText: "the same line",
      replaceWith: "a different line",
    });
    expect(answer).toContain("appears more than once");
    expect(harness.editor.trackedChanges(repeatsDocumentId)).toHaveLength(0);
  });

  it("names the documents that exist when the path is wrong", async () => {
    const client = await harness.startClient();
    const answer = await client.call("list_tracked_changes", { path: "nope.tex" });
    expect(answer).toContain('No editable document at "nope.tex"');
    expect(answer).toContain("main.tex");
  });

  it("refuses a suggestion on a read-only project before sending anything", async () => {
    harness.editor.permissionsLevel = "readOnly";
    const client = await harness.startClient();
    const answer = await client.call("suggest_edit", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Goodbye world.",
    });
    expect(answer).toContain("read-only access");
    expect(harness.editor.trackedChanges(harness.mainDocumentId)).toHaveLength(0);
  });

  it("explains a document in the history-OT format instead of passing on Overleaf's terse refusal", async () => {
    harness.editor.historyOtDocumentIds.add(harness.mainDocumentId);
    const client = await harness.startClient();
    const answer = await client.call("list_tracked_changes", { path: "main.tex" });
    expect(answer).toContain("newer history-OT format");
    expect(answer).toContain("Git-bridge tools");
  });

  it("leaves the Git-bridge tools reading the bridge, not the editor", async () => {
    const client = await harness.startClient();
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
