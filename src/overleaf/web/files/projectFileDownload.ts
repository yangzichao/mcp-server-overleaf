import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";

/**
 * One uploaded binary file, such as a figure: `GET /Project/:id/file/:fileId`
 * (`FileStoreController.getFile`, read access), served from project history with its
 * Content-Length. Editable documents are not served here; their text comes from the real-time
 * editor. An unknown file id is a 404.
 */

/** Overleaf's default upload limit; a caller can pass a higher cap. */
export const DEFAULT_MAXIMUM_FILE_DOWNLOAD_BYTES = 50 * 1024 * 1024;

export async function downloadProjectFile(
  client: OverleafWebClient,
  projectId: string,
  fileId: string,
  maximumBytes = DEFAULT_MAXIMUM_FILE_DOWNLOAD_BYTES,
): Promise<Buffer> {
  const path = `/Project/${requireOverleafId(projectId, "Project id")}/file/${requireOverleafId(fileId, "File id")}`;
  return (await client.download(path, { maximumBytes, timeoutMs: 300_000 })).bytes;
}
