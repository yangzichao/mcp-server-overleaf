import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LIVE_PROJECT_NAME, LiveOverleafServer, liveRunIdentifier } from "../support/liveOverleafServer.js";
import { liveEditorConfigured, liveOverleafSettings } from "../support/liveOverleafSettings.js";
import { callFailing, callSucceeding } from "../support/liveToolCalls.js";
import {
  findUniqueAnchorLine,
  messageIdOnLineMentioning,
  scratchCommentLine,
  threadIdFromAddCommentReply,
  trackedChangeIdsMentioning,
} from "./editorScratchLine.js";

const runIdentifier = liveRunIdentifier();
const runTag = runIdentifier.slice(-6);
const draftWord = `draft-${runTag}`;
const suggestedWord = `suggested-${runTag}`;
const acceptedWord = `accepted-${runTag}`;

describe.skipIf(!liveEditorConfigured)(
  "the editor tools against a live Overleaf project, cookie only",
  () => {
    const documentPath = liveOverleafSettings?.editorDocumentPath ?? "main.tex";
    let server: LiveOverleafServer;
    let anchorLine = "";
    let currentScratchLine = scratchCommentLine(runIdentifier, draftWord);
    let threadId: string | undefined;
    const call = (toolName: string, toolArguments: Record<string, unknown> = {}) =>
      callSucceeding(server.client, toolName, { project: LIVE_PROJECT_NAME, ...toolArguments });
    const readDocument = () => call("read_file", { path: documentPath });
    const listTrackedChanges = () => call("read_review", { view: "tracked_changes", path: documentPath });
    const suggest = (findText: string, replaceWith: string) =>
      call("manage_tracked_changes", { action: "suggest", path: documentPath, findText, replaceWith });

    beforeAll(async () => {
      server = await LiveOverleafServer.start("editorOnly");
    });

    afterAll(async () => {
      if (!server) return;
      try {
        if (threadId) await call("manage_comments", { action: "delete", threadId }).catch(() => undefined);
        const leftover = trackedChangeIdsMentioning(await listTrackedChanges(), runTag);
        if (leftover.length > 0) {
          await call("manage_tracked_changes", { action: "reject", path: documentPath, changeIds: leftover });
        }
        if ((await readDocument()).includes(currentScratchLine)) {
          await call("edit_file", {
            action: "replace_text",
            path: documentPath,
            findText: `\n${currentScratchLine}`,
            replaceWith: "",
          });
        }
      } finally {
        await server.stop();
      }
    });

    it("offers the editor-backed file tools and hides the Git-only ones", async () => {
      const toolNames = await server.client.listToolNames();
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("manage_tracked_changes");
      expect(toolNames).not.toContain("push_changes");
      expect(await call("read_project", { view: "files" })).toContain(documentPath);
    });

    it("writes straight into the live document", async () => {
      anchorLine = findUniqueAnchorLine(await readDocument());
      expect(
        await call("edit_file", {
          action: "replace_text",
          path: documentPath,
          findText: anchorLine,
          replaceWith: `${anchorLine}\n${currentScratchLine}`,
        }),
      ).toContain("Replaced 1 occurrence(s)");
      expect(await readDocument()).toContain(currentScratchLine);
    });

    it("refuses an emoji, which Overleaf's editor would corrupt", async () => {
      await callFailing(server.client, "edit_file", {
        action: "replace_text",
        project: LIVE_PROJECT_NAME,
        path: documentPath,
        findText: draftWord,
        replaceWith: "\u{1F600}",
      });
      expect(await readDocument()).toContain(currentScratchLine);
    });

    it("suggests an edit, lists it, and rejecting it restores the text", async () => {
      await suggest(draftWord, suggestedWord);
      const changeIds = trackedChangeIdsMentioning(await listTrackedChanges(), runTag);
      expect(changeIds).toHaveLength(2);

      expect(
        await call("manage_tracked_changes", { action: "reject", path: documentPath, changeIds }),
      ).toContain("Rejected");
      const afterReject = await readDocument();
      expect(afterReject).toContain(currentScratchLine);
      expect(afterReject).not.toContain(suggestedWord);
    });

    it("accepting a suggestion makes it the text", async () => {
      await suggest(draftWord, acceptedWord);
      const changeIds = trackedChangeIdsMentioning(await listTrackedChanges(), runTag);
      expect(
        await call("manage_tracked_changes", { action: "accept", path: documentPath, changeIds }),
      ).toContain("Accepted");
      currentScratchLine = scratchCommentLine(runIdentifier, acceptedWord);
      expect(await readDocument()).toContain(currentScratchLine);
    });

    it("runs a comment thread through every action, from first message to deletion", async () => {
      const quoteText = `mcp-e2e ${runIdentifier}`;
      const listComments = (includeResolved?: boolean) =>
        call("read_review", {
          view: "comments",
          path: documentPath,
          ...(includeResolved && { includeResolved }),
        });
      threadId = threadIdFromAddCommentReply(
        await call("manage_comments", {
          action: "add",
          path: documentPath,
          quoteText,
          message: `First message ${runTag}`,
        }),
      );
      expect(await listComments()).toContain(`First message ${runTag}`);

      expect(
        await call("manage_comments", { action: "reply", threadId, message: `Reply ${runTag}` }),
      ).toContain(`Replied in thread ${threadId}.`);
      const replyId = messageIdOnLineMentioning(await listComments(), `Reply ${runTag}`);
      expect(
        await call("manage_comments", {
          action: "edit_message",
          threadId,
          messageId: replyId,
          message: `Edited reply ${runTag}`,
        }),
      ).toContain(`Edited message ${replyId} in thread ${threadId}`);
      expect(await listComments()).toContain(`Edited reply ${runTag}`);

      expect(await call("manage_comments", { action: "resolve", threadId })).toContain(
        `Resolved thread ${threadId}`,
      );
      const withResolved = await listComments(true);
      expect(withResolved).toContain(`Edited reply ${runTag}`);
      expect(withResolved).toContain("resolved");
      expect(await call("manage_comments", { action: "reopen", threadId })).toContain(
        `Reopened thread ${threadId}`,
      );

      expect(
        await call("manage_comments", { action: "delete_message", threadId, messageId: replyId }),
      ).toContain(`Deleted message ${replyId}`);
      const afterDeletingReply = await listComments();
      expect(afterDeletingReply).toContain(`First message ${runTag}`);
      expect(afterDeletingReply).not.toContain(`Edited reply ${runTag}`);

      expect(await call("manage_comments", { action: "delete", threadId })).toContain(
        `Deleted thread ${threadId}`,
      );
      threadId = undefined;
      expect(await listComments(true)).not.toContain(`First message ${runTag}`);
    });

    it("removes its scratch line and leaves the anchor as it was", async () => {
      await call("edit_file", {
        action: "replace_text",
        path: documentPath,
        findText: `\n${currentScratchLine}`,
        replaceWith: "",
      });
      const restored = await readDocument();
      expect(restored).not.toContain(`mcp-e2e ${runIdentifier}`);
      expect(restored).toContain(anchorLine);
    });
  },
);
