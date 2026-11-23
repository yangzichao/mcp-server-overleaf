import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";
import { responseText } from "../support/mcpProtocol.js";

/**
 * Editing and deleting single messages in a comment thread. The fake numbers messages
 * message-1, message-2, … in the order a test seeds them, and "You" is the signed-in account.
 */

const THREAD_ID = "aaaaaaaaaaaaaaaaaa000001";
const MISSING_THREAD_ID = "bbbbbbbbbbbbbbbbbb000002";

describe("editing and deleting comment messages", () => {
  const harness = useEditorTestHarness();

  function seedThread(messages: Array<{ author: string; content: string }>): void {
    const position = harness.offsetOf(harness.mainDocumentId, "Hello world.");
    harness.editor.addComment(harness.mainDocumentId, "Hello world.", position, THREAD_ID);
    harness.editor.web.addThread(THREAD_ID, messages);
  }

  function seedQuestionAndAnswer(): void {
    seedThread([
      { author: "Ada", content: "Should this greeting be formal?" },
      { author: "You", content: "Yes, keep it." },
    ]);
  }

  function threadMessages(): string[] {
    return (harness.editor.web.threads.get(THREAD_ID)?.messages ?? []).map(
      (message) => `${message.id}: ${message.content}`,
    );
  }

  function messageRequests(): string[] {
    return harness.editor.web.requests
      .filter((request) => /\/thread\/[0-9a-f]{24}\/(messages|own-messages)\/[^/]+/.test(request.path))
      .map((request) => `${request.method} ${request.path}`);
  }

  it("shows each message's id in read_review's comments view", async () => {
    seedQuestionAndAnswer();
    const client = await harness.startClient();
    const listed = await client.call("read_review", { view: "comments", path: "main.tex" });
    expect(listed).toContain(
      "    [message message-1] Ada 2026-11-01T12:01:00.000Z: Should this greeting be formal?",
    );
    expect(listed).toContain("    [message message-2] You 2026-11-01T12:02:00.000Z: Yes, keep it.");
  });

  it("edits the account's own message and confirms the new text", async () => {
    seedQuestionAndAnswer();
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "edit_message",
      threadId: THREAD_ID,
      messageId: "message-2",
      message: "No, make it formal.",
    });
    expect(answer).toBe(
      `Edited message message-2 in thread ${THREAD_ID}; reading the thread again shows the new text.`,
    );
    expect(threadMessages()).toEqual([
      "message-1: Should this greeting be formal?",
      "message-2: No, make it formal.",
    ]);
  });

  it("explains Overleaf's refusal to edit someone else's message", async () => {
    seedQuestionAndAnswer();
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "edit_message",
      threadId: THREAD_ID,
      messageId: "message-1",
      message: "Rewritten.",
    });
    expect(answer).toBe(
      "Overleaf refused to edit message message-1, which Ada wrote. Overleaf's editor offers editing only on one's own messages; reply in the thread instead.",
    );
    expect(threadMessages()[0]).toBe("message-1: Should this greeting be formal?");
  });

  it("deletes a reply and keeps the rest of the thread", async () => {
    seedQuestionAndAnswer();
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "delete_message",
      threadId: THREAD_ID,
      messageId: "message-2",
    });
    expect(answer).toBe(
      `Deleted message message-2 by You from thread ${THREAD_ID}; reading the thread again confirms it is gone, and the thread's other messages stay.`,
    );
    expect(threadMessages()).toEqual(["message-1: Should this greeting be formal?"]);
    expect(messageRequests()).toEqual([
      `DELETE /project/${harness.editor.projectId}/thread/${THREAD_ID}/messages/message-2`,
    ]);
  });

  it("refuses to delete the message that opens a thread, before asking Overleaf", async () => {
    seedQuestionAndAnswer();
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "delete_message",
      threadId: THREAD_ID,
      messageId: "message-1",
    });
    expect(answer).toBe(
      `Message message-1 opens thread ${THREAD_ID}. Use action delete to remove the whole thread, or edit_message to change its text.`,
    );
    expect(messageRequests()).toEqual([]);
  });

  it("deletes a reviewer's own reply through the reviewers' route, and explains a refusal of anyone else's", async () => {
    seedThread([
      { author: "Ada", content: "Should this greeting be formal?" },
      { author: "You", content: "Yes, keep it." },
      { author: "Ada", content: "Fine by me." },
    ]);
    harness.editor.permissionsLevel = "review";
    const client = await harness.startClient();

    const own = await client.call("manage_comments", {
      action: "delete_message",
      threadId: THREAD_ID,
      messageId: "message-2",
    });
    expect(own).toContain("Deleted message message-2 by You");

    const theirs = await client.call("manage_comments", {
      action: "delete_message",
      threadId: THREAD_ID,
      messageId: "message-3",
    });
    expect(theirs).toBe(
      "Overleaf refused to delete message message-3, which Ada wrote: with review access, only one's own messages can be deleted.",
    );
    expect(threadMessages()).toEqual([
      "message-1: Should this greeting be formal?",
      "message-3: Fine by me.",
    ]);
    expect(messageRequests().every((request) => request.includes("/own-messages/"))).toBe(true);
  });

  it("names the ids that exist when a thread or message id is wrong", async () => {
    seedQuestionAndAnswer();
    const client = await harness.startClient();
    expect(
      await client.call("manage_comments", {
        action: "edit_message",
        threadId: THREAD_ID,
        messageId: "message-9",
        message: "Anything.",
      }),
    ).toBe(
      `Thread ${THREAD_ID} has no message message-9. Its messages: [message message-1] by Ada, [message message-2] by You.`,
    );
    expect(
      await client.call("manage_comments", {
        action: "delete_message",
        threadId: MISSING_THREAD_ID,
        messageId: "message-1",
      }),
    ).toBe(
      `No comment thread ${MISSING_THREAD_ID} in this project. read_review (view comments) shows the thread ids that exist.`,
    );
    expect(messageRequests()).toEqual([]);
  });

  it("fails when Overleaf accepts a change that reading the thread again does not show", async () => {
    seedQuestionAndAnswer();
    harness.editor.web.ignoreMessageChanges = true;
    const client = await harness.startClient();

    const edited = await client.callRaw("manage_comments", {
      action: "edit_message",
      threadId: THREAD_ID,
      messageId: "message-2",
      message: "No, make it formal.",
    });
    expect(edited.result?.isError).toBe(true);
    expect(responseText(edited)).toBe(
      `Overleaf accepted the edit, but reading thread ${THREAD_ID} again shows message message-2 still reading "Yes, keep it.".`,
    );

    const deleted = await client.callRaw("manage_comments", {
      action: "delete_message",
      threadId: THREAD_ID,
      messageId: "message-2",
    });
    expect(deleted.result?.isError).toBe(true);
    expect(responseText(deleted)).toBe(
      `Overleaf accepted the deletion, but message message-2 is still in thread ${THREAD_ID} when the thread is read again.`,
    );
  });

  it("names the argument an action is missing, and refuses messageId where it does not apply", async () => {
    const client = await harness.startClient();
    expect(await client.call("manage_comments", { action: "edit_message", threadId: THREAD_ID })).toBe(
      "edit_message needs messageId.",
    );
    expect(
      await client.call("manage_comments", {
        action: "edit_message",
        threadId: THREAD_ID,
        messageId: "message-1",
      }),
    ).toBe("edit_message needs message.");
    expect(await client.call("manage_comments", { action: "delete_message", messageId: "message-1" })).toBe(
      "delete_message needs threadId.",
    );
    expect(
      await client.call("manage_comments", {
        action: "reply",
        threadId: THREAD_ID,
        message: "Thanks.",
        messageId: "message-1",
      }),
    ).toBe("messageId does not apply to reply; edit_message and delete_message use it.");
    expect(
      await client.call("manage_comments", {
        action: "delete_message",
        threadId: THREAD_ID,
        messageId: "a/b",
      }),
    ).toContain("A message id is letters, digits, - and _ only.");
  });
});
