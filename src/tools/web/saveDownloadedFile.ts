import { randomBytes } from "node:crypto";
import { open, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";

/**
 * Saves a file downloaded from Overleaf to a path the model chose, with the checks that keep a
 * mistyped path from doing damage: the path is absolute, ends in the right extension, sits in
 * a directory that already exists, and replaces only an earlier file of the same kind.
 *
 * The bytes go to a temporary file beside the target first and are renamed into place, so a
 * failed write never leaves half a PDF where a whole one used to be.
 */

export interface DownloadKind {
  readonly label: string;
  readonly extension: string;
  /** The first bytes every file of this kind starts with. */
  readonly signature: Buffer;
}

export const PDF_DOWNLOAD: DownloadKind = {
  label: "PDF",
  extension: ".pdf",
  signature: Buffer.from("%PDF-"),
};
export const ZIP_DOWNLOAD: DownloadKind = {
  label: "ZIP archive",
  extension: ".zip",
  signature: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};

async function startsWithSignature(path: string, signature: Buffer): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(signature.length);
    const { bytesRead } = await handle.read(head, 0, signature.length, 0);
    return bytesRead === signature.length && head.equals(signature);
  } finally {
    await handle.close();
  }
}

async function assertTargetIsReplaceable(target: string, kind: DownloadKind): Promise<void> {
  const existing = await stat(target).catch(() => undefined);
  if (!existing) return;
  if (!existing.isFile() || !(await startsWithSignature(target, kind.signature))) {
    throw new Error(
      `${target} already exists and is not a ${kind.label}, so it was left alone. Choose another path.`,
    );
  }
}

export async function saveDownloadedFile(
  requestedPath: string,
  bytes: Buffer,
  kind: DownloadKind,
): Promise<string> {
  if (!isAbsolute(requestedPath)) {
    throw new Error(
      `Give an absolute path to save the ${kind.label} to, for example /Users/me/Desktop/paper${kind.extension}.`,
    );
  }
  const target = resolve(requestedPath);
  if (extname(target).toLowerCase() !== kind.extension) {
    throw new Error(`The path to save a ${kind.label} to must end in ${kind.extension}.`);
  }
  const directory = await stat(dirname(target)).catch(() => undefined);
  if (!directory?.isDirectory()) {
    throw new Error(`The directory ${dirname(target)} does not exist. Nothing was saved.`);
  }
  if (!bytes.subarray(0, kind.signature.length).equals(kind.signature)) {
    throw new Error(`Overleaf sent something that is not a ${kind.label}, so it was not saved.`);
  }
  await assertTargetIsReplaceable(target, kind);

  const temporary = `${target}.partial-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return target;
}

export function describeByteSize(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} bytes`;
  if (byteCount < 1024 * 1024) return `${(byteCount / 1024).toFixed(1)} KB`;
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}
