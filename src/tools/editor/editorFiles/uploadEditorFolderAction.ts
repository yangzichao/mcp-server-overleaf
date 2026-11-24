import type { OverleafProjectTree } from "../../../overleaf/realtime/overleafProjectDocuments.js";
import { findTreeEntity, parentPathOf } from "../../../overleaf/realtime/overleafTreeEntities.js";
import { uploadProjectFile } from "../../../overleaf/web/files/projectFileUpload.js";
import {
  type CopiedFile,
  describeCopiedFileCount,
  describeCopiedFiles,
  describeReplacedCount,
  describeSkippedEntries,
} from "../../editing/folderUpload/describeFolderUpload.js";
import {
  describeFolderUploadDestination,
  type FolderUploadTarget,
  planFolderUploadTargets,
} from "../../editing/folderUpload/folderUploadTargets.js";
import { readFolderUploadFile } from "../../editing/folderUpload/readFolderUploadFile.js";
import type { LocalFolderListing } from "../../editing/folderUpload/readLocalFolder.js";
import { requireFolderPathClear, requireRootFolderId } from "../../fileTree/ensureOverleafFolder.js";
import { requireFileTreeEditAccess } from "../../fileTree/requireFileTreeEditAccess.js";
import { withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";

function findReplacedEntities(
  tree: OverleafProjectTree,
  targets: readonly FolderUploadTarget[],
): Set<string> {
  const replaced = new Set<string>();
  for (const target of targets) {
    requireFolderPathClear(tree, parentPathOf(target.projectPath));
    const existing = findTreeEntity(tree, target.projectPath);
    if (existing?.type === "folder") {
      throw new Error(
        `${target.projectPath} is a folder in Overleaf, so a file cannot be uploaded there. Nothing was changed.`,
      );
    }
    if (existing) replaced.add(target.projectPath);
  }
  return replaced;
}

function describeStoredAs(copied: readonly CopiedFile[]): string {
  const documents = copied.filter((file) => file.storedAs === "doc").length;
  const binaryFiles = copied.length - documents;
  if (binaryFiles === 0) return "Overleaf stored each as an editable document.";
  if (documents === 0) return "Overleaf stored each as a binary file.";
  return `Overleaf stored ${documents} as editable documents and ${binaryFiles} as binary files.`;
}

function describeStoppedUpload(
  copied: readonly CopiedFile[],
  failed: FolderUploadTarget,
  error: unknown,
): string {
  const reason = error instanceof Error ? error.message : String(error);
  if (copied.length === 0) return `${failed.projectPath} was not uploaded: ${reason} Nothing was changed.`;
  return [
    `Uploaded ${describeCopiedFileCount(copied)}, then ${failed.projectPath} was not uploaded: ${reason}`,
    ...describeCopiedFiles(copied),
    `${EDITOR_CHANGE_IS_LIVE} manage_files (action delete) takes them out again.`,
  ].join("\n");
}

/**
 * One upload per file through the file tree's upload route, one after another, so Overleaf
 * creates each missing folder once. Overleaf replaces what is at each path and decides whether
 * a file becomes an editable document.
 */
export function uploadEditorFolderAction(
  context: ToolContext,
  project: string | undefined,
  destination: string,
  listing: LocalFolderListing,
): Promise<ToolTextResult> {
  const targets = planFolderUploadTargets(destination, listing.files);
  const client = requireOverleafWebClient(context);
  return withReviewSession(context, project, async (session) => {
    const tree = session.project;
    const replaced = findReplacedEntities(tree, targets);
    requireFileTreeEditAccess(session);
    const rootFolderId = requireRootFolderId(tree);
    const copied: CopiedFile[] = [];
    for (const target of targets) {
      try {
        const uploaded = await uploadProjectFile(client, tree.projectId, {
          folderId: rootFolderId,
          relativePath: target.projectPath,
          bytes: await readFolderUploadFile(target),
        });
        copied.push({
          projectPath: target.projectPath,
          size: target.file.size,
          replaced: replaced.has(target.projectPath),
          storedAs: uploaded.entityType,
        });
      } catch (error) {
        throw new Error(describeStoppedUpload(copied, target, error));
      }
    }
    return textResult(
      [
        `Uploaded ${describeCopiedFileCount(copied)} from ${listing.folderPath} into ${describeFolderUploadDestination(destination)} in Overleaf${describeReplacedCount(copied)}. ${describeStoredAs(copied)}`,
        ...describeCopiedFiles(copied),
        ...describeSkippedEntries(listing.skipped),
        EDITOR_CHANGE_IS_LIVE,
      ].join("\n"),
    );
  });
}
