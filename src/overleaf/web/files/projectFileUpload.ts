import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { RequestNotSentError } from "../overleafWebErrors.js";
import { checkEntityName } from "./entityNameRules.js";

/**
 * Uploading a file into a project as the file tree's upload dialog does
 * (`file-tree-create/modes/file-tree-upload-doc.tsx`): `POST /Project/:id/upload?folder_id=…`
 * (`UploadsRouter.mjs`, edit access), a multipart form read by multer's `single('qqfile')` with
 * `name`, and `relativePath` for a file inside a dropped folder, placed before the file.
 *
 * `ProjectUploadController.uploadFile` treats a `relativePath` with folders in it by creating
 * those folders under `folder_id` (`EditorController.mkdirp`), so a file can go to a folder that
 * does not exist yet. It then calls `FileSystemImportManager.addEntity` with replace set: a file
 * already at that path is replaced, and a text file such as a .tex or .bib becomes an editable
 * document rather than a binary upload. The answer is `{ success, entity_id, entity_type }`;
 * refusals are 422 with an `error` code such as `invalid_filename` or `duplicate_file_name`.
 */

/** `Settings.maxUploadSize` in Overleaf's defaults. */
export const MAXIMUM_FILE_UPLOAD_BYTES = 50 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 300_000;

export interface ProjectFileUpload {
  /** The folder `relativePath` starts from; usually the project's root folder. */
  readonly folderId: string;
  /** Where the file goes under that folder, such as "figures/plot.png". */
  readonly relativePath: string;
  readonly bytes: Buffer;
}

export interface UploadedEntity {
  readonly entityId: string;
  /** "doc" when Overleaf stored the upload as an editable document, "file" for a binary. */
  readonly entityType: "doc" | "file";
}

function splitRelativePath(relativePath: string): { folders: string[]; fileName: string } {
  const segments = relativePath.replace(/^\.?\//, "").split("/");
  const fileName = segments.pop() ?? "";
  for (const folder of segments) checkEntityName(folder);
  return { folders: segments, fileName: checkEntityName(fileName) };
}

export async function uploadProjectFile(
  client: OverleafWebClient,
  projectId: string,
  upload: ProjectFileUpload,
): Promise<UploadedEntity> {
  const id = requireOverleafId(projectId, "Project id");
  const folderId = requireOverleafId(upload.folderId, "Folder id");
  const { folders, fileName } = splitRelativePath(upload.relativePath);
  if (upload.bytes.length > MAXIMUM_FILE_UPLOAD_BYTES) {
    throw new RequestNotSentError(
      `The file is ${upload.bytes.length} bytes; Overleaf accepts uploads up to ${MAXIMUM_FILE_UPLOAD_BYTES} bytes.`,
    );
  }
  const answer = (await client.postForm(
    `/Project/${id}/upload?folder_id=${folderId}`,
    () => {
      const form = new FormData();
      form.append("name", fileName);
      if (folders.length > 0) form.append("relativePath", [...folders, fileName].join("/"));
      form.append("qqfile", new Blob([new Uint8Array(upload.bytes)]), fileName);
      return form;
    },
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  )) as { success?: unknown; entity_id?: unknown; entity_type?: unknown; error?: unknown } | undefined;
  if (answer?.success !== true || typeof answer.entity_id !== "string") {
    const reason = typeof answer?.error === "string" ? ` ${answer.error}` : "";
    throw new Error(`Overleaf did not store the upload.${reason}`);
  }
  return { entityId: answer.entity_id, entityType: answer.entity_type === "doc" ? "doc" : "file" };
}
