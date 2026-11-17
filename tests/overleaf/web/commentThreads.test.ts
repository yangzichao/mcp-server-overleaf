import { describe, expect, it } from "vitest";

import { readCommentThreads } from "../../../src/overleaf/web/commentThreads.js";

/** The `/threads` payload, as `ReviewPanelCommentThread` in services/web/types describes it. */

describe("reading comment threads", () => {
  it("keeps each message with its author's name and an ISO time", () => {
    const threads = readCommentThreads({
      t1: {
        messages: [
          {
            id: "m1",
            content: "Too long?",
            timestamp: 1_762_000_000_000,
            user_id: "u1",
            user: { first_name: "Ada", last_name: "L" },
          },
        ],
      },
    });
    expect(threads.get("t1")).toEqual({
      threadId: "t1",
      messages: [
        {
          messageId: "m1",
          content: "Too long?",
          authorName: "Ada L",
          authorId: "u1",
          postedAt: new Date(1_762_000_000_000).toISOString(),
        },
      ],
      resolved: false,
      resolvedAt: undefined,
      resolvedByName: undefined,
    });
  });

  it("records who resolved a thread and when", () => {
    const thread = readCommentThreads({
      t1: {
        messages: [],
        resolved: true,
        resolved_at: "2026-11-02T09:00:00Z",
        resolved_by_user_id: "u2",
        resolved_by_user: { email: "grace@example.com" },
      },
    }).get("t1");
    expect(thread?.resolved).toBe(true);
    expect(thread?.resolvedAt).toBe("2026-11-02T09:00:00.000Z");
    expect(thread?.resolvedByName).toBe("grace@example.com");
  });

  it("falls back to the user id when Overleaf could not attach a name", () => {
    const thread = readCommentThreads({ t1: { messages: [{ content: "Hi", user_id: "u3" }] } }).get("t1");
    expect(thread?.messages[0]?.authorName).toBe("user u3");
  });

  it("drops entries that are not threads or messages rather than failing", () => {
    const threads = readCommentThreads({
      broken: null,
      t1: { messages: [42, { no: "content" }, { content: "kept" }] },
    });
    expect([...threads.keys()]).toEqual(["t1"]);
    expect(threads.get("t1")?.messages.map((message) => message.content)).toEqual(["kept"]);
    expect(readCommentThreads("not an object").size).toBe(0);
  });
});
