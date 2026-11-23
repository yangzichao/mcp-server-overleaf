import { describe, expect, it } from "vitest";

import { callExpectingError, startCookieOnlyClient } from "../support/cookieOnlyClient.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

const CHAPTER = "\\section{Intro}\nOld intro.\n\\section{Method}\nMethod text.\n";

describe("edit_file over the editor, with only a session cookie", () => {
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

  it("replaces a section and keeps a comment anchored outside it in place", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    const answer = await client.call("edit_file", {
      action: "replace_section",
      path: "chapter.tex",
      sectionTitle: "intro",
      content: "\\section{Intro}\nA new introduction.",
    });
    expect(answer).toBe(
      "Replaced \\section{Intro} (lines 1-2) in chapter.tex. It is in Overleaf now; co-authors see it already.",
    );
    expect(harness.editor.documentText(documentId)).toBe(
      "\\section{Intro}\nA new introduction.\n\\section{Method}\nMethod text.\n",
    );
    expect(harness.editor.commentAnchors(documentId)[0]?.op.p).toBe(
      harness.offsetOf(documentId, "Method text."),
    );
    expect(harness.editor.trackedChanges(documentId)).toHaveLength(0);
  });

  it("refuses a missing section, listing the titles there are, and changes nothing", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    const answer = await callExpectingError(client, "edit_file", {
      action: "replace_section",
      path: "chapter.tex",
      sectionTitle: "Results",
      content: "\\section{Results}\n",
    });
    expect(answer).toBe('No section matching "Results" in chapter.tex. Available: Intro, Method');
    expect(harness.editor.documentText(documentId)).toBe(CHAPTER);
  });

  it("overwrites an existing document by sending only what differs", async () => {
    const documentId = addChapterWithComment();
    const client = await startCookieOnlyClient(harness);
    const rewritten = "\\section{Introduction}\nOld intro.\n\\section{Method}\nMethod text.\n";
    const answer = await client.call("edit_file", {
      action: "write",
      path: "chapter.tex",
      content: rewritten,
    });
    expect(answer).toContain("Overwrote chapter.tex in Overleaf, sending only the passages that differ");
    expect(harness.editor.documentText(documentId)).toBe(rewritten);
    expect(harness.editor.commentAnchors(documentId)[0]?.op.p).toBe(
      harness.offsetOf(documentId, "Method text."),
    );
    expect(await client.call("edit_file", { action: "write", path: "chapter.tex", content: rewritten })).toBe(
      "chapter.tex already holds exactly this content. Nothing was changed.",
    );
  });

  it("creates a missing document, and its missing folders, through the file tree", async () => {
    const client = await startCookieOnlyClient(harness);
    const answer = await client.call("edit_file", {
      action: "write",
      path: "chapters/one/intro.tex",
      content: "\\section{One}\nFirst chapter.\n",
    });
    expect(answer).toBe(
      "Created chapters/one/intro.tex in Overleaf, along with the missing folders chapters, chapters/one. It is in Overleaf now; co-authors see it already.",
    );
    const created = harness.editor.tree.entityAt("chapters/one/intro.tex");
    expect(created?.type).toBe("doc");
    expect(harness.editor.documentText(created?.id ?? "")).toBe("\\section{One}\nFirst chapter.\n");

    expect(await client.call("edit_file", { action: "write", path: "sections/empty.tex", content: "" })).toBe(
      "Created sections/empty.tex in Overleaf. It is in Overleaf now; co-authors see it already.",
    );
    expect(harness.editor.documentText(harness.editor.tree.entityAt("sections/empty.tex")?.id ?? "")).toBe(
      "",
    );
  });

  it("appends on a new line, and refuses a missing file or a binary upload", async () => {
    const client = await startCookieOnlyClient(harness);
    const answer = await client.call("edit_file", {
      action: "append",
      path: "main.tex",
      content: "% A closing note.\n",
    });
    expect(answer).toBe(
      "Appended 1 line to the end of main.tex. It is in Overleaf now; co-authors see it already.",
    );
    expect(harness.editor.documentText(harness.mainDocumentId)).toBe(
      "\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}\n% A closing note.\n",
    );
    expect(
      await callExpectingError(client, "edit_file", { action: "append", path: "absent.tex", content: "x" }),
    ).toBe(
      "absent.tex does not exist, so there is nothing to append to. Nothing was written; use action write to create it.",
    );
    expect(
      await callExpectingError(client, "edit_file", { action: "append", path: "figure.png", content: "x" }),
    ).toContain("figure.png is an uploaded binary file in Overleaf");
  });

  it("refuses to write text over an upload or a folder", async () => {
    const client = await startCookieOnlyClient(harness);
    expect(
      await callExpectingError(client, "edit_file", { action: "write", path: "figure.png", content: "x" }),
    ).toContain("manage_files (action upload)");
    expect(
      await callExpectingError(client, "edit_file", { action: "write", path: "sections", content: "x" }),
    ).toContain("sections is a folder in Overleaf");
    expect(harness.editor.tree.files.size).toBe(1);
  });

  it("points a reviewer at suggestions, and refuses emoji, before anything is sent", async () => {
    const documentId = addChapterWithComment();
    harness.editor.permissionsLevel = "review";
    const client = await startCookieOnlyClient(harness);
    for (const call of [
      { action: "replace_section", sectionTitle: "Intro", content: "\\section{Intro}\nNew." },
      { action: "write", content: "Replaced." },
      { action: "append", content: "More." },
    ]) {
      expect(await callExpectingError(client, "edit_file", { ...call, path: "chapter.tex" })).toContain(
        "Use manage_tracked_changes (action suggest) instead.",
      );
    }
    expect(
      await callExpectingError(client, "edit_file", {
        action: "write",
        path: "new.tex",
        content: "Hi \u{1F600}",
      }),
    ).toContain("content contains");
    expect(harness.editor.documentText(documentId)).toBe(CHAPTER);
    expect(harness.editor.tree.entityAt("new.tex")).toBeUndefined();
  });

  it("checks the arguments against the action", async () => {
    const client = await startCookieOnlyClient(harness);
    expect(
      await callExpectingError(client, "edit_file", {
        action: "replace_section",
        path: "main.tex",
        content: "x",
      }),
    ).toBe("replace_section needs sectionTitle.");
    expect(await callExpectingError(client, "edit_file", { action: "write", path: "main.tex" })).toBe(
      "write needs content.",
    );
    expect(
      await callExpectingError(client, "edit_file", {
        action: "replace_text",
        path: "main.tex",
        findText: "Hello",
        replaceWith: "Hi",
        content: "x",
      }),
    ).toBe("content does not apply to replace_text; replace_section, write and append use it.");
  });
});
