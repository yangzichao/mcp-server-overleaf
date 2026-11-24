import { findTreeEntity, parentPathOf } from "../../../overleaf/realtime/overleafTreeEntities.js";
import { uploadProjectFile } from "../../../overleaf/web/files/projectFileUpload.js";
import { requireFolderPathClear, requireRootFolderId } from "../../fileTree/ensureOverleafFolder.js";
import { requireTreePath } from "../../fileTree/fileTreePaths.js";
import { requireFileTreeEditAccess } from "../../fileTree/requireFileTreeEditAccess.js";
import { withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { describeByteSize } from "../../web/saveDownloadedFile.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";

/**
 * Uploads through the file tree's upload dialog route. Overleaf creates the folders the path
 * names, replaces whatever is at the path, and decides whether the file becomes an editable
 * document or a binary upload; the reply says which.
 */
export function uploadEditorFileAction(
  context: ToolContext,
  project: string | undefined,
  path: string,
  bytes: Buffer,
): Promise<ToolTextResult> {
  const treePath = requireTreePath(path, "path");
  const client = requireOverleafWebClient(context);
  return withReviewSession(context, project, async (session) => {
    const tree = session.project;
    const existing = findTreeEntity(tree, treePath);
    if (existing?.type === "folder") {
      throw new Error(
        `${treePath} is a folder in Overleaf, so a file cannot be uploaded there. Nothing was changed.`,
      );
    }
    requireFolderPathClear(tree, parentPathOf(treePath));
    requireFileTreeEditAccess(session);
    const uploaded = await uploadProjectFile(client, tree.projectId, {
      folderId: requireRootFolderId(tree),
      relativePath: treePath,
      bytes,
    });
    const storedAs = uploaded.entityType === "doc" ? "an editable document" : "a binary file";
    return textResult(
      `${existing ? "Replaced" : "Added"} ${treePath} (${describeByteSize(bytes.length)}) in Overleaf, stored as ${storedAs}. ${EDITOR_CHANGE_IS_LIVE}`,
    );
  });
}
