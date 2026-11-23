import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import { chooseRootDocument } from "../../latex/chooseRootDocument.js";
import { createEditorProjectSourceReader } from "../../latex/editorProjectSourceReader.js";
import { describeOutlineFromSource } from "../../reading/projectViews/describeOutlineFromSource.js";
import { truncateForModel } from "../../toolContext.js";
import { findMainDocumentPath } from "./editorFilesView.js";

interface OutlineRoot {
  readonly path: string;
  readonly heading: string;
  readonly warning: string | undefined;
}

async function chooseOutlineRoot(
  session: OverleafRealtimeSession,
  reader: ReturnType<typeof createEditorProjectSourceReader>,
  path: string | undefined,
): Promise<OutlineRoot> {
  if (path !== undefined) {
    const chosen = await chooseRootDocument(reader, reader.projectFiles, path, "path");
    return { path: chosen.path, heading: "", warning: undefined };
  }
  const mainDocument = findMainDocumentPath(session.project);
  if (mainDocument) {
    return {
      path: mainDocument,
      heading: `Outline of ${mainDocument}, the main document set in Overleaf's menu:\n`,
      warning: undefined,
    };
  }
  const guessed = await chooseRootDocument(reader, reader.projectFiles, undefined, "path");
  return {
    path: guessed.path,
    heading: `Outline of ${guessed.path}, the likely main document (Overleaf's menu names none):\n`,
    warning: guessed.warning,
  };
}

/** The headings of path, or of the project's main document, read from Overleaf's editor. */
export async function describeEditorOutline(
  session: OverleafRealtimeSession,
  path: string | undefined,
  followIncludes: boolean,
): Promise<string> {
  const reader = createEditorProjectSourceReader(session);
  const root = await chooseOutlineRoot(session, reader, path);
  const outline = await describeOutlineFromSource(reader, root.path, followIncludes);
  return truncateForModel(`${root.heading}${outline}${root.warning ? `\n\n${root.warning}` : ""}`);
}
