import { describe, expect, it } from "vitest";

import { callExpectingError, startCookieOnlyClient } from "../support/cookieOnlyClient.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

const CHAPTER = "\\section{Intro}\nOld intro.\n\\section{Method}\nMethod text.\n";
const IN_REVIEW_PANEL = "It is in Overleaf now, in the review panel, waiting to be accepted or rejected.";

describe("manage_tracked_changes suggesting a whole section or document", () => {
  const harness = useEditorTestHarness();

  function addChapterWithComment(): string {
    const documentId = harness.editor.addDocument("chapter.tex", CHAPTER);
    harness.editor.addComment(
      documentId,
      "Method text.",
      CHAPTER.indexOf("Method text."),
      "c0ffee000000000000000001",
    );
    return documentId;
  }

  function trackedTexts(documentId: string): string[] {
    return harness.editor
      .trackedChanges(documentId)
      .map((change) => ("d" in change.op ? `-${change.op.d}` : `+${change.op.i}`))
      .sort();
  }

  it("suggests only what differs in one section, leaving a comment elsewhere in place", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    const answer = await client.call("manage_tracked_changes", {
      action: "suggest",
      path: "chapter.tex",
      sectionTitle: "Intro",
      content: "\\section{Intro}\nA new intro.",
    });
    expect(answer).toBe(
      "Suggested a rewrite of \\section{Intro} (lines 1-2) in chapter.tex as 1 suggested deletion and 1 suggested insertion, covering only the passages that differ.\n" +
        IN_REVIEW_PANEL,
    );
    expect(trackedTexts(documentId)).toEqual(["+A new", "-Old"]);
    expect(harness.editor.documentText(documentId)).toBe(
      "\\section{Intro}\nA new intro.\n\\section{Method}\nMethod text.\n",
    );
    expect(harness.editor.commentAnchors(documentId)[0]?.op.p).toBe(
      harness.offsetOf(documentId, "Method text."),
    );
  });

  it("suggests a whole document's new text as separate suggestions per passage", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    const answer = await client.call("manage_tracked_changes", {
      action: "suggest",
      path: "chapter.tex",
      content: `${CHAPTER.replace("Old intro.", "New intro.")}\\section{Results}\nNone yet.\n`,
    });
    expect(answer).toBe(
      "Suggested a rewrite of the whole of chapter.tex as 1 suggested deletion and 2 suggested insertions, covering only the passages that differ.\n" +
        IN_REVIEW_PANEL,
    );
    expect(trackedTexts(documentId)).toEqual(["+New", "+\\section{Results}\nNone yet.\n", "-Old"]);
    expect(harness.editor.commentAnchors(documentId)[0]?.op.p).toBe(
      harness.offsetOf(documentId, "Method text."),
    );
  });

  it("lets a reviewer suggest a rewrite, and sends nothing when the text already matches", async () => {
    const documentId = addChapterWithComment();
    harness.editor.permissionsLevel = "review";
    const client = await startCookieOnlyClient(harness);
    expect(
      await client.call("manage_tracked_changes", {
        action: "suggest",
        path: "chapter.tex",
        content: CHAPTER,
      }),
    ).toBe("the whole of chapter.tex already reads exactly like content, so there is nothing to suggest.");
    expect(
      await client.call("manage_tracked_changes", {
        action: "suggest",
        path: "chapter.tex",
        sectionTitle: "method",
        content: "\\section{Method}\nMethod text, revised.\n",
      }),
    ).toContain("as 0 suggested deletions and 1 suggested insertion");
    expect(trackedTexts(documentId)).toEqual(["+, revised"]);
  });

  it("lists the section titles when the section is missing", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    expect(
      await client.call("manage_tracked_changes", {
        action: "suggest",
        path: "chapter.tex",
        sectionTitle: "Results",
        content: "\\section{Results}\n",
      }),
    ).toBe('No section matching "Results" in chapter.tex. Available: Intro, Method');
    expect(harness.editor.trackedChanges(documentId)).toHaveLength(0);
  });

  it("refuses mixed or half-given forms, emoji, and read-only access, before anything is sent", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    const suggest = (extra: Record<string, unknown>) =>
      callExpectingError(client, "manage_tracked_changes", {
        action: "suggest",
        path: "chapter.tex",
        ...extra,
      });

    expect(await suggest({ findText: "Old intro.", content: "x" })).toBe(
      "suggest takes findText with replaceWith for one snippet, or content (with sectionTitle for one section) for a rewrite, not both. Nothing was sent.",
    );
    expect(await suggest({ sectionTitle: "Intro" })).toBe("suggest needs content.");
    expect(await suggest({ replaceWith: "New intro." })).toBe("suggest needs findText.");
    expect(await suggest({})).toBe("suggest needs findText and replaceWith, or content.");
    expect(await suggest({ content: "Smile \u{1F600}" })).toContain("content contains");

    harness.editor.permissionsLevel = "readOnly";
    expect(await suggest({ content: "New text.\n" })).toBe(
      "This account has read-only access to the project, and Overleaf requires review access to leave a tracked change.",
    );
    expect(harness.editor.documentText(documentId)).toBe(CHAPTER);
    expect(harness.editor.trackedChanges(documentId)).toHaveLength(0);
  });
});
