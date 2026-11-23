import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

/**
 * Reads a file from this computer for manage_files (action upload), with the limits that keep a confused or
 * manipulated model from publishing something it should not: an absolute path to a regular
 * file, no hidden file or directory anywhere in the path (where SSH keys, cloud credentials
 * and `.env` files live), and no more than Overleaf accepts for one file.
 */

/** Overleaf refuses uploads above 50 MB. */
export const MAXIMUM_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function readLocalUpload(sourcePath: string): Promise<Buffer> {
  if (!isAbsolute(sourcePath)) {
    throw new Error(
      "sourcePath must be an absolute path to a file on this computer, e.g. /Users/me/figures/plot.png.",
    );
  }
  const absolutePath = resolve(sourcePath);
  const hiddenPart = absolutePath
    .split(sep)
    .find((part) => part.startsWith(".") && part !== "." && part !== "..");
  if (hiddenPart) {
    throw new Error(
      `Refusing to upload from a hidden path (${hiddenPart}): hidden files and directories usually hold credentials or settings, not paper material.`,
    );
  }
  const entry = await stat(absolutePath).catch(() => undefined);
  if (!entry?.isFile()) throw new Error(`${absolutePath} is not a file on this computer.`);
  if (entry.size > MAXIMUM_UPLOAD_BYTES) {
    throw new Error(
      `${absolutePath} is ${entry.size} bytes, more than the 50 MB Overleaf accepts for one file.`,
    );
  }
  return await readFile(absolutePath);
}

export function decodeBase64Upload(contentBase64: string): Buffer {
  const compact = contentBase64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new Error("contentBase64 is not valid base64.");
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length > MAXIMUM_UPLOAD_BYTES)
    throw new Error("The decoded content is more than the 50 MB Overleaf accepts.");
  return bytes;
}
