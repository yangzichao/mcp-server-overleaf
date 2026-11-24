import { findTreeEntity } from "../../../overleaf/realtime/overleafTreeEntities.js";
import { deleteEntity } from "../../../overleaf/web/files/projectFileTree.js";
import { describeDirectoryFiles } from "../../editing/fileActions/describeDirectoryFiles.js";
import { requireTreePath } from "../../fileTree/fileTreePaths.js";
import { holdsMainDocument, listFolderFiles } from "../../fileTree/listFolderFiles.js";
import { requireFileTreeEditAccess } from "../../fileTree/requireFileTreeEditAccess.js";
import { withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";

const MAIN_DOCUMENT_GONE =
  " It held the project's main document, so choose another before compiling, in Overleaf's menu or with manage_project (action update_settings).";

/** Deletes a document, an upload, or a folder with everything in it, from Overleaf's file tree. */
export function deleteEditorEntityAction(
  context: ToolContext,
  project: string | undefined,
  path: string,
): Promise<ToolTextResult> {
  const treePath = requireTreePath(path, "path");
  const client = requireOverleafWebClient(context);
  return withReviewSession(context, project, async (session) => {
    const tree = session.project;
    const entity = findTreeEntity(tree, treePath);
    if (!entity) return textResult(`${treePath} is not in the project, so there is nothing to delete.`);
    requireFileTreeEditAccess(session);
    const filesInFolder = entity.type === "folder" ? listFolderFiles(tree, treePath) : [];
    const mainDocumentNote = holdsMainDocument(tree, treePath) ? MAIN_DOCUMENT_GONE : "";
    await deleteEntity(client, tree.projectId, { type: entity.type, id: entity.id });
    const what =
      entity.type !== "folder"
        ? treePath
        : filesInFolder.length === 0
          ? `the empty folder ${treePath}`
          : `the folder ${treePath} and ${describeDirectoryFiles(filesInFolder)}`;
    return textResult(`Deleted ${what} from Overleaf. ${EDITOR_CHANGE_IS_LIVE}${mainDocumentNote}`);
  });
}
