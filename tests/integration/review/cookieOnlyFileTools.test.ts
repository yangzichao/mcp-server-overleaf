import { describe, expect, it } from "vitest";

import { PAPER, useEditorTestHarness } from "../support/editorTestHarness.js";

describe("file tools over the editor, with only a session cookie", () => {
  const harness = useEditorTestHarness();

  function startCookieOnlyClient() {
    return harness.startClient({
      OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
      OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}`,
      OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
      XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
    });
  }

  it("lists documents and uploads, with the main document Overleaf has set", async () => {
    harness.editor.addDocument("sections/intro.tex", "\\section{Intro}\n");
    const client = await startCookieOnlyClient();
    const listing = await client.call("list_files", {});
    expect(listing).toContain("3 files");
    expect(listing).toContain("Main document: main.tex");
    expect(listing).toContain("sections/intro.tex");
    expect(listing).toContain("figure.png (binary)");
    expect(await client.call("list_files", { extension: "png" })).toContain("1 files matching .png");
  });

  it("reads a document whole and as a numbered line range", async () => {
    const client = await startCookieOnlyClient();
    expect(await client.call("read_file", { path: "main.tex" })).toBe(PAPER);
    expect(await client.call("read_file", { path: "main.tex", startLine: 3, endLine: 3 })).toBe(
      "3\tHello world.",
    );
  });

  it("refuses a binary upload and points at download_project_zip", async () => {
    const client = await startCookieOnlyClient();
    const response = await client.callRaw("read_file", { path: "figure.png" });
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toContain("download_project_zip");
  });

  it("replaces text in Overleaf at once, as an ordinary edit rather than a suggestion", async () => {
    const client = await startCookieOnlyClient();
    const answer = await client.call("replace_text", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Hello, brave new world.",
    });
    expect(answer).toContain("Replaced 1 occurrence(s) in main.tex");
    expect(harness.editor.documentText(harness.mainDocumentId)).toContain("Hello, brave new world.");
    expect(await client.call("list_tracked_changes", { path: "main.tex" })).toContain("No tracked changes");
  });

  it("replaces every occurrence when asked, and only then", async () => {
    const documentId = harness.editor.addDocument("repeats.tex", "x and x and x\n");
    const client = await startCookieOnlyClient();
    expect(
      await client.call("replace_text", { path: "repeats.tex", findText: "x", replaceWith: "y" }),
    ).toContain("appears 3 times");
    expect(harness.editor.documentText(documentId)).toBe("x and x and x\n");
    await client.call("replace_text", {
      path: "repeats.tex",
      findText: "x",
      replaceWith: "yy",
      replaceAll: true,
    });
    expect(harness.editor.documentText(documentId)).toBe("yy and yy and yy\n");
  });

  it("refuses an emoji instead of letting Overleaf store it as replacement characters", async () => {
    const client = await startCookieOnlyClient();
    for (const toolName of ["replace_text", "suggest_edit"]) {
      const response = await client.callRaw(toolName, {
        path: "main.tex",
        findText: "Hello world.",
        replaceWith: "Hello 😀.",
      });
      expect(response.result?.isError).toBe(true);
      expect(response.result?.content?.[0]?.text).toContain("U+1F600");
    }
    expect(harness.editor.documentText(harness.mainDocumentId)).toBe(PAPER);
  });

  it("sends a reviewer to suggest_edit instead of editing", async () => {
    harness.editor.permissionsLevel = "review";
    const client = await startCookieOnlyClient();
    const response = await client.callRaw("replace_text", {
      path: "main.tex",
      findText: "Hello world.",
      replaceWith: "Goodbye.",
    });
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text).toContain("Use suggest_edit instead");
    expect(harness.editor.documentText(harness.mainDocumentId)).toBe(PAPER);
  });

  it("tells a reviewer about a wrong snippet the same way it tells an editor", async () => {
    harness.editor.permissionsLevel = "review";
    const client = await startCookieOnlyClient();
    const response = await client.callRaw("replace_text", {
      path: "main.tex",
      findText: "Not in the paper.",
      replaceWith: "Goodbye.",
    });
    expect(response.result?.isError).not.toBe(true);
    expect(response.result?.content?.[0]?.text).toContain("Text not found in main.tex");
  });
});
