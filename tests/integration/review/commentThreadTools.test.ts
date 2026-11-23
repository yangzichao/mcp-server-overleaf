import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * Comment threads end to end: the anchor goes over the real-time socket, the messages over
 * the web application, and each tool has to touch the right half.
 */

const THREAD_ID = "aaaaaaaaaaaaaaaaaa000001";
const THREAD_PATTERN = /\(thread ([0-9a-f]{24})\)/;

describe("the comment thread tools", () => {
  const harness = useEditorTestHarness();

  function seedCollaboratorThread(resolved = false): void {
    const position = harness.offsetOf(harness.mainDocumentId, "Hello world.");
    harness.editor.addComment(harness.mainDocumentId, "Hello world.", position, THREAD_ID);
    harness.editor.web.addThread(
      THREAD_ID,
      [{ author: "Ada", content: "Should this greeting be formal?" }],
      resolved,
    );
  }

  it("starts a thread with its first message, anchored to the quoted passage", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "add",
      path: "main.tex",
      quoteText: "Hello world.",
      message: "Is this the right greeting?",
    });
    expect(answer).toContain('Commented on "Hello world." in main.tex');
    const threadId = THREAD_PATTERN.exec(answer)?.[1];
    expect(threadId).toBeDefined();

    expect(harness.editor.commentAnchors(harness.mainDocumentId).map((comment) => comment.op.t)).toEqual([
      threadId,
    ]);
    expect(
      harness.editor.web.threads.get(threadId ?? "")?.messages.map((message) => message.content),
    ).toEqual(["Is this the right greeting?"]);

    const listed = await client.call("read_review", { view: "tracked_changes", path: "main.tex" });
    expect(listed).toContain("1 comment thread:");
    expect(listed).toContain('line 3, on "Hello world."');
    expect(listed).toContain("read_review (view comments) reads the messages in each thread.");
  });

  it("removes the message again when anchoring the thread fails", async () => {
    harness.editor.rejectNextUpdateWith = "doc version mismatch";
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "add",
      path: "main.tex",
      quoteText: "Hello world.",
      message: "Is this the right greeting?",
    });
    expect(answer).toContain("doc version mismatch");
    expect(harness.editor.web.threads.size).toBe(0);
  });

  it("lists a thread's messages with author, under its document and line", async () => {
    seedCollaboratorThread();
    const client = await harness.startClient();
    const listed = await client.call("read_review", { view: "comments" });
    expect(listed).toContain("main.tex:");
    expect(listed).toContain(`[thread ${THREAD_ID}] line 3, on "Hello world." (open)`);
    expect(listed).toContain("Ada");
    expect(listed).toContain("Should this greeting be formal?");
    expect(listed).toContain("written by collaborators");
  });

  it("hides resolved threads unless asked, and says how many it hid", async () => {
    seedCollaboratorThread(true);
    const client = await harness.startClient();
    const defaultListing = await client.call("read_review", { view: "comments", path: "main.tex" });
    expect(defaultListing).toContain("No open comment threads.");
    expect(defaultListing).toContain("1 resolved thread is hidden");

    const fullListing = await client.call("read_review", {
      view: "comments",
      path: "main.tex",
      includeResolved: true,
    });
    expect(fullListing).toContain("(resolved by You on 2026-11-02T09:00:00.000Z)");
  });

  it("reports a thread whose anchor text was deleted", async () => {
    harness.editor.web.addThread(THREAD_ID, [{ author: "Ada", content: "This paragraph is gone now." }]);
    const client = await harness.startClient();
    const listed = await client.call("read_review", { view: "comments" });
    expect(listed).toContain("No comment threads.");
    expect(listed).toContain("1 thread has messages but no anchor in any document");
  });

  it("replies in an existing thread", async () => {
    seedCollaboratorThread();
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "reply",
      threadId: THREAD_ID,
      message: "Yes, changed it.",
    });
    expect(answer).toContain(`Replied in thread ${THREAD_ID}.`);
    expect(harness.editor.web.threads.get(THREAD_ID)?.messages.map((message) => message.content)).toEqual([
      "Should this greeting be formal?",
      "Yes, changed it.",
    ]);
  });

  it("refuses to reply to a thread that does not exist rather than creating one", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "reply",
      threadId: THREAD_ID,
      message: "Hello?",
    });
    expect(answer).toContain(`No comment thread ${THREAD_ID}`);
    expect(harness.editor.web.threads.size).toBe(0);
  });

  it("resolves a thread and reopens it", async () => {
    seedCollaboratorThread();
    const client = await harness.startClient();
    const resolved = await client.call("manage_comments", { action: "resolve", threadId: THREAD_ID });
    expect(resolved).toContain(`Resolved thread ${THREAD_ID} on "Hello world." in main.tex.`);
    expect(harness.editor.web.threads.get(THREAD_ID)?.resolved).toBe(true);

    const reopened = await client.call("manage_comments", {
      action: "reopen",
      threadId: THREAD_ID,
      path: "main.tex",
    });
    expect(reopened).toContain(`Reopened thread ${THREAD_ID}`);
    expect(harness.editor.web.threads.get(THREAD_ID)?.resolved).toBeUndefined();
  });

  it("deletes a thread's anchor and its messages", async () => {
    seedCollaboratorThread();
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", { action: "delete", threadId: THREAD_ID });
    expect(answer).toContain(`Deleted thread ${THREAD_ID}`);
    expect(harness.editor.web.threads.has(THREAD_ID)).toBe(false);
    expect(harness.editor.commentAnchors(harness.mainDocumentId)).toHaveLength(0);
  });

  it("names read_review when a thread id is not anchored anywhere", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", { action: "resolve", threadId: THREAD_ID });
    expect(answer).toContain(`No comment thread ${THREAD_ID} is anchored`);
    expect(answer).toContain("read_review (view comments) shows the thread ids that exist.");
  });

  it("sends the page's CSRF token with every change", async () => {
    seedCollaboratorThread();
    const client = await harness.startClient();
    await client.call("manage_comments", { action: "resolve", threadId: THREAD_ID });
    const mutations = harness.editor.web.requests.filter((request) => request.method !== "GET");
    expect(mutations.length).toBeGreaterThan(0);
    for (const mutation of mutations) expect(mutation.csrfToken).toBe(harness.editor.web.csrfToken);
  });

  it("asks for a fresh cookie when Overleaf no longer recognises the session", async () => {
    seedCollaboratorThread();
    harness.editor.web.sessionExpired = true;
    const client = await harness.startClient();
    const answer = await client.call("manage_comments", {
      action: "reply",
      threadId: THREAD_ID,
      message: "Hello?",
    });
    expect(answer).toContain("did not accept the session cookie");
    expect(answer).toContain("fresh overleaf_session2 cookie");
  });
});
