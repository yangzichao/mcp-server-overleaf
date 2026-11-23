import type { OverleafWebClient } from "../overleafWebClient.js";
import { RequestNotSentError } from "../overleafWebErrors.js";
import { checkProjectName } from "./projectNameRules.js";

/**
 * A new project from a ZIP archive, as the project list's "Upload project" makes one:
 * `POST /project/new/upload` (`UploadsRouter.mjs`), a multipart form read by multer's
 * `single('qqfile')` with the archive's file name in `name`.
 * `ProjectUploadController.uploadProject` names the project `Path.basename(name, '.zip')` and
 * answers `{ success: true, project_id }`; an archive it cannot use (`InvalidZipFileError`) is a
 * 422 whose `error` says why, and any other failure a 500.
 */

/** `Settings.maxUploadSize` in Overleaf's defaults; multer refuses anything larger with a 422. */
export const MAXIMUM_PROJECT_UPLOAD_BYTES = 50 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 300_000;
const ZIP_LOCAL_FILE_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function looksLikeZipArchive(bytes: Buffer): boolean {
  return bytes.subarray(0, ZIP_LOCAL_FILE_SIGNATURE.length).equals(ZIP_LOCAL_FILE_SIGNATURE);
}

export async function createProjectFromZip(
  client: OverleafWebClient,
  projectName: string,
  zipBytes: Buffer,
): Promise<string> {
  const name = checkProjectName(projectName);
  if (!looksLikeZipArchive(zipBytes)) {
    throw new RequestNotSentError(
      "That file is not a ZIP archive, so Overleaf cannot make a project from it.",
    );
  }
  if (zipBytes.length > MAXIMUM_PROJECT_UPLOAD_BYTES) {
    throw new RequestNotSentError(
      `The archive is ${zipBytes.length} bytes; Overleaf accepts uploads up to ${MAXIMUM_PROJECT_UPLOAD_BYTES} bytes.`,
    );
  }
  const fileName = `${name}.zip`;
  const answer = (await client.postForm(
    "/project/new/upload",
    () => {
      const form = new FormData();
      form.append("name", fileName);
      form.append("qqfile", new Blob([new Uint8Array(zipBytes)], { type: "application/zip" }), fileName);
      return form;
    },
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  )) as { success?: unknown; project_id?: unknown; error?: unknown } | undefined;
  if (answer?.success !== true || typeof answer.project_id !== "string") {
    const reason = typeof answer?.error === "string" ? ` ${answer.error}` : "";
    throw new Error(`Overleaf did not create a project from the archive.${reason}`);
  }
  return answer.project_id;
}
