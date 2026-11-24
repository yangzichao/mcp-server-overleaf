import { findTreeEntity } from "../../overleaf/realtime/overleafTreeEntities.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editor/editorFileArguments.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../toolContext.js";
import { requireOverleafWebClient } from "../web/requireOverleafWebClient.js";
import { describeEntityType } from "./describeTreeEntity.js";
import { ensureOverleafFolder } from "./ensureOverleafFolder.js";
import { requireTreePath } from "./fileTreePaths.js";
import { requireFileTreeEditAccess } from "./requireFileTreeEditAccess.js";

export interface FolderCreation {
  readonly project: string | undefined;
  readonly path: string;
  /** What the reply adds about putting files in the new folder, which differs with and without a clone. */
  readonly nextStep: string;
}

/**
 * Creates a folder in Overleaf's file tree, and any missing parents, at once. It is the one way to
 * get an empty folder into a project: Git records files, never folders, so a clone cannot hold one.
 */
export function createFolderAction(context: ToolContext, creation: FolderCreation): Promise<ToolTextResult> {
  const path = requireTreePath(creation.path, "path");
  const client = requireOverleafWebClient(context);
  return withReviewSession(context, creation.project, async (session) => {
    const existing = findTreeEntity(session.project, path);
    if (existing?.type === "folder") {
      return textResult(`${path} is already a folder in Overleaf, so nothing was created.`);
    }
    if (existing) {
      throw new Error(
        `${path} is ${describeEntityType(existing.type)} in Overleaf, so a folder cannot be created there. Nothing was changed.`,
      );
    }
    requireFileTreeEditAccess(session);
    const { createdPaths } = await ensureOverleafFolder(client, session.project, path);
    const parents = createdPaths.slice(0, -1);
    const withParents =
      parents.length > 0
        ? `, with its missing parent ${parents.length === 1 ? "folder" : "folders"} ${parents.join(", ")}`
        : "";
    return textResult(
      `Created the folder ${path} in Overleaf${withParents}. ${EDITOR_CHANGE_IS_LIVE} ${creation.nextStep}`,
    );
  });
}
