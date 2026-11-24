import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { describeByteSize } from "../../web/saveDownloadedFile.js";
import { decodeBase64Upload, readLocalUpload } from "../readLocalUpload.js";

/** The bytes to upload, from exactly one of the two sources a call can give. */
export async function readUploadBytes(
  sourcePath: string | undefined,
  contentBase64: string | undefined,
): Promise<Buffer> {
  if ((sourcePath === undefined) === (contentBase64 === undefined)) {
    throw new Error("Give exactly one of sourcePath and contentBase64.");
  }
  return sourcePath !== undefined
    ? await readLocalUpload(sourcePath)
    : decodeBase64Upload(contentBase64 ?? "");
}

/** Writes the bytes into the clone, replacing a file already at path. */
export async function uploadFileAction(
  repository: OverleafGitRepository,
  path: string,
  bytes: Buffer,
): Promise<string> {
  // A text-only checkout would leave the new file outside the sparse patterns, where
  // `git add --all` skips it and the push silently goes without it.
  await repository.materializeAllFiles();
  const existedBefore = await repository.fileExists(path);
  await repository.writeFileBytes(path, bytes);
  return (
    `${existedBefore ? "Replaced" : "Added"} ${path} (${describeByteSize(bytes.length)}) in the local clone. ` +
    "Review it with read_project (view changes), then call push_changes to publish it to Overleaf."
  );
}
