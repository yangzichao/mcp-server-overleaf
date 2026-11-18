import { describe, expect, it } from "vitest";

import type { McpStdioClient } from "../mcpStdioClient.js";
import { PAPER, useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * Accepting goes over the web application; rejecting is an undo edit over the real-time socket.
 * Both are checked by what the editor holds afterwards, not by what the tool says.
 */

describe("accepting and rejecting tracked changes", () => {
  const harness = useEditorTestHarness();

  async function suggestReplacement(): Promise<McpStdioClient> {
    const client = await harness.startClient();
    await client.call("suggest_edit", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Hello, brave new world.",
    });
    return client;
  }

  function changeIdOfKind(kind: "insertion" | "deletion"): string {
    const change = harness.editor
      .trackedChanges(harness.mainDocumentId)
      .find((candidate) => (kind === "insertion" ? candidate.op.i : candidate.op.d) !== undefined);
    if (!change) throw new Error(`No ${kind} to decide.`);
    return change.id;
  }

  it("accepts every suggestion in a document", async () => {
    const client = await suggestReplacement();
    const answer = await client.call("accept_tracked_changes", { path: "main.tex", all: true });
    expect(answer).toContain("Accepted 2 suggestions in main.tex");
    expect(harness.editor.trackedChanges(harness.mainDocumentId)).toHaveLength(0);
    expect(harness.editor.documentText(harness.mainDocumentId)).toContain("Hello, brave new world.");
  });

  it("accepts only the suggestions named by id", async () => {
    const client = await suggestReplacement();
    const insertionId = changeIdOfKind("insertion");
    const answer = await client.call("accept_tracked_changes", {
      path: "main.tex",
      changeIds: [insertionId],
    });
    expect(answer).toContain(`Accepted 1 suggestion in main.tex:\n- [${insertionId}] line 3: insert`);
    const remaining = harness.editor.trackedChanges(harness.mainDocumentId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.op.d).toBe("Hello world.");
    const acceptRequest = harness.editor.web.requests.find((request) =>
      request.path.endsWith("/changes/accept"),
    );
    expect(acceptRequest?.csrfToken).toBe(harness.editor.web.csrfToken);
  });

  it("rejects a replacement and puts the original text back", async () => {
    const client = await suggestReplacement();
    const answer = await client.call("reject_tracked_changes", { path: "main.tex", all: true });
    expect(answer).toContain("Rejected 2 suggestions in main.tex");
    expect(harness.editor.documentText(harness.mainDocumentId)).toBe(PAPER);
    expect(harness.editor.trackedChanges(harness.mainDocumentId)).toHaveLength(0);
  });

  it("rejects one suggestion and leaves the other pending", async () => {
    const client = await suggestReplacement();
    const insertionId = changeIdOfKind("insertion");
    await client.call("reject_tracked_changes", { path: "main.tex", changeIds: [insertionId] });
    expect(harness.editor.documentText(harness.mainDocumentId)).not.toContain("brave new world");
    const remaining = harness.editor.trackedChanges(harness.mainDocumentId);
    expect(remaining.map((change) => change.op.d)).toEqual(["Hello world."]);
  });

  it("rejects a collaborator's suggestion without recording the undo as a new one", async () => {
    const position = harness.offsetOf(harness.mainDocumentId, "world");
    harness.editor.collaboratorSuggests(harness.mainDocumentId, [{ p: position, i: "big " }]);
    const client = await harness.startClient();
    const answer = await client.call("reject_tracked_changes", { path: "main.tex", all: true });
    expect(answer).toContain('insert "big "');
    expect(harness.editor.documentText(harness.mainDocumentId)).toBe(PAPER);
    expect(harness.editor.trackedChanges(harness.mainDocumentId)).toHaveLength(0);
  });

  it("refuses a reviewer account before sending anything", async () => {
    const client = await suggestReplacement();
    harness.editor.permissionsLevel = "review";
    const answer = await client.call("accept_tracked_changes", { path: "main.tex", all: true });
    expect(answer).toContain("review access");
    expect(answer).toContain("needs edit access");
    expect(harness.editor.trackedChanges(harness.mainDocumentId)).toHaveLength(2);
  });

  it("refuses an unknown id and decides nothing", async () => {
    const client = await suggestReplacement();
    const answer = await client.call("reject_tracked_changes", {
      path: "main.tex",
      changeIds: [changeIdOfKind("insertion"), "not-a-change"],
    });
    expect(answer).toContain("No tracked change not-a-change in main.tex");
    expect(harness.editor.trackedChanges(harness.mainDocumentId)).toHaveLength(2);
  });

  it("asks for either ids or all, not neither", async () => {
    const client = await suggestReplacement();
    const answer = await client.call("accept_tracked_changes", { path: "main.tex" });
    expect(answer).toContain("Give either changeIds or all: true");
  });

  it("says so when there is nothing to decide", async () => {
    const client = await harness.startClient();
    const answer = await client.call("accept_tracked_changes", { path: "main.tex", all: true });
    expect(answer).toContain("There are no tracked changes in main.tex.");
  });
});
