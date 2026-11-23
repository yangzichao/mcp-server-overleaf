import { describe, expect, it } from "vitest";

import type { OverleafRealtimeSession } from "../../../src/overleaf/realtime/overleafRealtimeSession.js";
import { createEditorProjectSourceReader } from "../../../src/tools/latex/editorProjectSourceReader.js";

type EditorSession = Pick<OverleafRealtimeSession, "project" | "joinDocument">;

function editorSessionWith(texts: Record<string, string>, binaryPaths: readonly string[] = []) {
  const joinedDocumentIds: string[] = [];
  const documents = Object.keys(texts).map((path, index) => ({
    path,
    documentId: `64a1b2c3d4e5f6a7b8c9d0${String(index).padStart(2, "0")}`,
  }));
  const session: EditorSession = {
    project: {
      projectId: "64a1b2c3d4e5f6a7b8c9d0e1",
      name: "Paper",
      rootDocumentId: documents[0]?.documentId,
      rootFolderId: "64a1b2c3d4e5f6a7b8c9d0ff",
      folders: [],
      documents,
      binaryFiles: binaryPaths.map((path, index) => ({
        path,
        fileId: `74a1b2c3d4e5f6a7b8c9d0${String(index).padStart(2, "0")}`,
      })),
    },
    joinDocument(documentId) {
      joinedDocumentIds.push(documentId);
      const path = documents.find((document) => document.documentId === documentId)?.path ?? "";
      return Promise.resolve({
        documentId,
        lines: (texts[path] ?? "").split("\n"),
        version: 1,
        ranges: { changes: [], comments: [] },
      });
    },
  };
  return { session, joinedDocumentIds };
}

describe("the editor-backed project source reader", () => {
  it("lists documents and uploads, and reads a document's text once per call", async () => {
    const { session, joinedDocumentIds } = editorSessionWith(
      { "main.tex": "\\input{intro}\n\\includegraphics{fig.png}", "intro.tex": "Hello" },
      ["fig.png"],
    );
    const reader = createEditorProjectSourceReader(session);

    expect([...reader.projectFiles].sort()).toEqual(["fig.png", "intro.tex", "main.tex"]);
    expect(await reader.readTextFile("intro.tex")).toBe("Hello");
    expect(await reader.readTextFile("intro.tex")).toBe("Hello");
    expect(joinedDocumentIds).toHaveLength(1);
  });

  it("says a binary upload has no text, and names a path that does not exist", async () => {
    const { session } = editorSessionWith({ "main.tex": "" }, ["fig.png"]);
    const reader = createEditorProjectSourceReader(session);

    await expect(reader.readTextFile("fig.png")).rejects.toThrow("fig.png is a binary upload");
    await expect(reader.readTextFile("missing.tex")).rejects.toThrow('No file at "missing.tex"');
  });
});
