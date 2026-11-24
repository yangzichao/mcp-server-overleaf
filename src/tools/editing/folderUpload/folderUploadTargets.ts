import { normaliseTreePath } from "../../../overleaf/realtime/overleafTreeEntities.js";
import { checkEntityName } from "../../../overleaf/web/files/entityNameRules.js";
import type { LocalFolderFile } from "./readLocalFolder.js";

export interface FolderUploadTarget {
  readonly projectPath: string;
  readonly file: LocalFolderFile;
}

export function readFolderUploadDestination(path: string): string {
  const trimmed = path.trim();
  return trimmed === "." ? "" : normaliseTreePath(trimmed);
}

export function describeFolderUploadDestination(destination: string): string {
  return destination === "" ? "the project's root folder" : destination;
}

export function planFolderUploadTargets(
  destination: string,
  files: readonly LocalFolderFile[],
): FolderUploadTarget[] {
  return files.map((file) => {
    const projectPath = destination ? `${destination}/${file.relativePath}` : file.relativePath;
    for (const name of projectPath.split("/")) {
      try {
        checkEntityName(name);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${projectPath} cannot go to Overleaf: ${reason} Nothing was copied.`);
      }
    }
    return { projectPath, file };
  });
}
