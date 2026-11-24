import { requireEditorSafeText } from "../../../overleaf/realtime/editorSafeText.js";
import { findTreeEntity } from "../../../overleaf/realtime/overleafTreeEntities.js";
import { createEditorDocument } from "../../fileTree/createEditorDocument.js";
import { describeEntityType } from "../../fileTree/describeTreeEntity.js";
import { requireTreePath } from "../../fileTree/fileTreePaths.js";
import { requireDocument, withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";
import { requireEditorWriteAccess } from "./requireEditorWriteAccess.js";
import { sendTextChange } from "./sendTextChange.js";

export interface EditorWholeFileWrite {
  readonly project: string | undefined;
  readonly path: string;
  readonly content: string;
}

type WriteOutcome =
  | { readonly kind: "overwritten"; readonly changed: boolean }
  | { readonly kind: "created"; readonly createdFolders: readonly string[] };

/**
 * Makes a document hold exactly content. An existing one receives only the passages that differ,
 * so comment anchors outside them survive; a missing one is created through the file tree, with
 * any missing parent folders, and filled in a second session, because the session that created it
 * still holds the project tree from before.
 */
export async function writeDocumentInEditor(
  context: ToolContext,
  edit: EditorWholeFileWrite,
): Promise<ToolTextResult> {
  requireEditorSafeText(edit.content, "content");
  const path = requireTreePath(edit.path, "path");
  const outcome = await withReviewSession(context, edit.project, async (session): Promise<WriteOutcome> => {
    const entity = findTreeEntity(session.project, path);
    if (entity && entity.type !== "doc") {
      throw new Error(
        `${path} is ${describeEntityType(entity.type)} in Overleaf, so it cannot be written as text. Nothing was changed.` +
          (entity.type === "file" ? " Replace an upload with manage_files (action upload)." : ""),
      );
    }
    requireEditorWriteAccess(session);
    if (entity) {
      const joined = await session.joinDocument(entity.id);
      return { kind: "overwritten", changed: await sendTextChange(session, joined, edit.content) };
    }
    const created = await createEditorDocument(requireOverleafWebClient(context), session.project, path);
    return { kind: "created", createdFolders: created.createdFolders };
  });

  if (outcome.kind === "overwritten") {
    return textResult(
      outcome.changed
        ? `Overwrote ${path} in Overleaf, sending only the passages that differ, so comments anchored elsewhere stay where they are. ${EDITOR_CHANGE_IS_LIVE}`
        : `${path} already holds exactly this content. Nothing was changed.`,
    );
  }
  try {
    await withReviewSession(context, edit.project, async (session) => {
      const joined = await session.joinDocument(requireDocument(session, path).documentId);
      await sendTextChange(session, joined, edit.content);
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Created ${path} in Overleaf, but writing its content failed, so the document is empty there now: ${reason} Call edit_file (action write) again to fill it.`,
    );
  }
  const folders = outcome.createdFolders;
  const withFolders =
    folders.length > 0
      ? `, along with the missing ${folders.length === 1 ? "folder" : "folders"} ${folders.join(", ")}`
      : "";
  return textResult(`Created ${path} in Overleaf${withFolders}. ${EDITOR_CHANGE_IS_LIVE}`);
}
