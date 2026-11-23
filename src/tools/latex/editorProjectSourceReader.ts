import type { ProjectSourceReader } from "../../latex/includes/walkIncludedFiles.js";
import { findDocument } from "../../overleaf/realtime/overleafProjectDocuments.js";
import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";

/**
 * The project as Overleaf's editor holds it now, for the checks that read many files on a server
 * with no clone: every path in the project tree, and each document's text, joined the first time
 * it is read and kept for the rest of the call. The text includes pending suggestions as if
 * accepted, as read_file shows it. Binary uploads are listed, so a figure counts as present, but
 * cannot be read as text.
 */
export function createEditorProjectSourceReader(
  session: Pick<OverleafRealtimeSession, "project" | "joinDocument">,
): ProjectSourceReader {
  const tree = session.project;
  const projectFiles = new Set([
    ...tree.documents.map((document) => document.path),
    ...tree.binaryFiles.map((file) => file.path),
  ]);
  const joinedTexts = new Map<string, Promise<string>>();
  return {
    projectFiles,
    readTextFile(path) {
      const cached = joinedTexts.get(path);
      if (cached) return cached;
      const document = findDocument(tree, path);
      if (!document) {
        return Promise.reject(
          new Error(
            projectFiles.has(path)
              ? `${path} is a binary upload, so it has no text to read.`
              : `No file at "${path}" in this project.`,
          ),
        );
      }
      const text = session.joinDocument(document.documentId).then((joined) => joined.lines.join("\n"));
      joinedTexts.set(path, text);
      return text;
    },
  };
}
