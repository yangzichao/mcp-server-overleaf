import type { OverleafProjectTree } from "../../../overleaf/realtime/overleafProjectDocuments.js";
import {
  baseNameOf,
  findTreeEntity,
  type OverleafTreeEntity,
  parentPathOf,
} from "../../../overleaf/realtime/overleafTreeEntities.js";
import { checkEntityName } from "../../../overleaf/web/files/entityNameRules.js";
import { moveEntity, renameEntity } from "../../../overleaf/web/files/projectFileTree.js";
import type { OverleafWebClient } from "../../../overleaf/web/overleafWebClient.js";
import { describeDirectoryFiles } from "../../editing/fileActions/describeDirectoryFiles.js";
import { ensureOverleafFolder } from "../../fileTree/ensureOverleafFolder.js";
import { requireTreePath } from "../../fileTree/fileTreePaths.js";
import { listFolderFiles } from "../../fileTree/listFolderFiles.js";
import { requireFileTreeEditAccess } from "../../fileTree/requireFileTreeEditAccess.js";
import { withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";

function joinTreePath(folderPath: string, name: string): string {
  return folderPath ? `${folderPath}/${name}` : name;
}

interface PlannedMove {
  readonly entity: OverleafTreeEntity;
  readonly fromPath: string;
  readonly toPath: string;
}

/**
 * Overleaf moves and renames in two separate requests, and each one refuses a name already taken
 * where the entity lands. Moving first needs the old name free in the target folder, renaming
 * first needs the new name free in the current one, so the order is picked to avoid the clash.
 */
async function moveAndRename(
  client: OverleafWebClient,
  tree: OverleafProjectTree,
  plan: PlannedMove,
): Promise<void> {
  const reference = { type: plan.entity.type, id: plan.entity.id };
  const oldName = baseNameOf(plan.fromPath);
  const newName = checkEntityName(baseNameOf(plan.toPath));
  const sourceFolder = parentPathOf(plan.fromPath);
  const targetFolder = parentPathOf(plan.toPath);
  if (sourceFolder === targetFolder) {
    await renameEntity(client, tree.projectId, reference, newName);
    return;
  }
  const renaming = newName !== oldName;
  const moveFirstClashes =
    renaming && findTreeEntity(tree, joinTreePath(targetFolder, oldName)) !== undefined;
  const renameFirstClashes =
    renaming && findTreeEntity(tree, joinTreePath(sourceFolder, newName)) !== undefined;
  if (moveFirstClashes && renameFirstClashes) {
    throw new Error(
      `Overleaf moves and renames in two steps, and both orders collide with a name already taken: ${joinTreePath(targetFolder, oldName)} and ${joinTreePath(sourceFolder, newName)}. Nothing was moved; rename or move one of those first.`,
    );
  }
  const folder = await ensureOverleafFolder(client, tree, targetFolder);
  const move = {
    description: `moved ${plan.fromPath} into ${targetFolder || "the project's root folder"}`,
    run: () => moveEntity(client, tree.projectId, reference, folder.folderId),
  };
  const rename = {
    description: `renamed ${plan.fromPath} to ${newName}`,
    run: () => renameEntity(client, tree.projectId, reference, newName),
  };
  if (!renaming) {
    await move.run();
    return;
  }
  const first = moveFirstClashes ? rename : move;
  const second = moveFirstClashes ? move : rename;
  await first.run();
  try {
    await second.run();
  } catch (error) {
    const landedAt = moveFirstClashes
      ? joinTreePath(sourceFolder, newName)
      : joinTreePath(targetFolder, oldName);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Overleaf ${first.description}, but the second step failed, so it is at ${landedAt} now rather than ${plan.toPath}: ${reason}`,
    );
  }
}

/** Renames a document, an upload or a folder, moves it to another folder, or both. */
export function moveEditorEntityAction(
  context: ToolContext,
  project: string | undefined,
  path: string,
  toPath: string,
): Promise<ToolTextResult> {
  const fromPath = requireTreePath(path, "path");
  const destinationPath = requireTreePath(toPath, "toPath");
  if (fromPath === destinationPath) {
    return Promise.resolve(textResult(`path and toPath are the same (${fromPath}). Nothing was moved.`));
  }
  const client = requireOverleafWebClient(context);
  return withReviewSession(context, project, async (session) => {
    const tree = session.project;
    const entity = findTreeEntity(tree, fromPath);
    if (!entity) throw new Error(`${fromPath} is not in the project, so there is nothing to move.`);
    if (findTreeEntity(tree, destinationPath)) {
      throw new Error(
        `${destinationPath} already exists. Nothing was moved. Delete it first, or choose another destination.`,
      );
    }
    if (entity.type === "folder" && destinationPath.startsWith(`${fromPath}/`)) {
      throw new Error(
        `${destinationPath} is inside ${fromPath}, and a folder cannot be moved into itself. Nothing was moved.`,
      );
    }
    requireFileTreeEditAccess(session);
    const filesInFolder = entity.type === "folder" ? listFolderFiles(tree, fromPath) : [];
    const plan = { entity, fromPath, toPath: destinationPath };
    await moveAndRename(client, tree, plan);
    return textResult(describeCompletedMove(plan, filesInFolder));
  });
}

/** The reply after a move, naming the files a folder carried and the references left pointing at nothing. */
function describeCompletedMove(plan: PlannedMove, filesInFolder: readonly string[]): string {
  const isFolder = plan.entity.type === "folder";
  let what = plan.fromPath;
  if (isFolder) {
    what =
      filesInFolder.length === 0
        ? `the empty folder ${plan.fromPath}`
        : `the folder ${plan.fromPath}, with ${describeDirectoryFiles(filesInFolder)},`;
  }
  const stillNamed = isFolder ? `a path under ${plan.fromPath}/` : plan.fromPath;
  return (
    `Moved ${what} to ${plan.toPath} in Overleaf. ${EDITOR_CHANGE_IS_LIVE} ` +
    `Any \\input, \\include or \\includegraphics still naming ${stillNamed} now points at nothing; search_project for it and fix it with edit_file.`
  );
}
