import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { requireVisibleAbsolutePath } from "../localSourcePath.js";
import { MAXIMUM_UPLOAD_BYTES } from "../readLocalUpload.js";
import { describeLocalReadProblem } from "./describeLocalReadProblem.js";

/** `maxNumberOfFiles` in Overleaf's upload dialog, `file-tree-upload-doc.tsx`. */
export const MAXIMUM_FOLDER_FILES = 180;
const MAXIMUM_ENTRIES_EXAMINED = 2_000;

export interface LocalFolderFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly size: number;
}

type SkippedEntryReason = "hidden" | "a symbolic link" | "not a regular file";

export interface SkippedLocalEntry {
  readonly relativePath: string;
  readonly reason: SkippedEntryReason;
}

export interface LocalFolderListing {
  readonly folderPath: string;
  readonly files: readonly LocalFolderFile[];
  readonly skipped: readonly SkippedLocalEntry[];
}

function compareRelativePaths(first: { relativePath: string }, second: { relativePath: string }): number {
  if (first.relativePath === second.relativePath) return 0;
  return first.relativePath < second.relativePath ? -1 : 1;
}

async function readFolderEntries(absolutePath: string): Promise<Dirent[]> {
  try {
    return await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Could not read the folder ${absolutePath}: ${describeLocalReadProblem(error)}. Nothing was copied.`,
    );
  }
}

async function readFileEntry(absolutePath: string, relativePath: string): Promise<LocalFolderFile> {
  const { size } = await stat(absolutePath).catch((error: unknown) => {
    throw new Error(
      `Could not read ${absolutePath}: ${describeLocalReadProblem(error)}. Nothing was copied.`,
    );
  });
  if (size > MAXIMUM_UPLOAD_BYTES) {
    throw new Error(
      `${absolutePath} is ${size} bytes, more than the 50 MB Overleaf accepts for one file. Nothing was copied.`,
    );
  }
  return { relativePath, absolutePath, size };
}

function skipReason(entry: Dirent): SkippedEntryReason | undefined {
  if (entry.name.startsWith(".")) return "hidden";
  if (entry.isSymbolicLink()) return "a symbolic link";
  if (!entry.isDirectory() && !entry.isFile()) return "not a regular file";
  return undefined;
}

class LocalFolderWalk {
  readonly files: LocalFolderFile[] = [];
  readonly skipped: SkippedLocalEntry[] = [];
  private examined = 0;

  constructor(private readonly folderPath: string) {}

  async walk(): Promise<void> {
    const folders = [""];
    while (folders.length > 0) {
      const relativeFolder = folders.pop() ?? "";
      for (const entry of await readFolderEntries(this.absolutePathOf(relativeFolder))) {
        const relativePath = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
        if (await this.isFolderToWalk(entry, relativePath)) folders.push(relativePath);
      }
    }
  }

  private async isFolderToWalk(entry: Dirent, relativePath: string): Promise<boolean> {
    this.examined += 1;
    if (this.examined > MAXIMUM_ENTRIES_EXAMINED) {
      throw new Error(
        `${this.folderPath} holds more than ${MAXIMUM_ENTRIES_EXAMINED} files and folders, hidden ones included. Copy one subfolder at a time. Nothing was copied.`,
      );
    }
    const reason = skipReason(entry);
    if (reason) {
      this.skipped.push({ relativePath, reason });
      return false;
    }
    if (entry.isDirectory()) return true;
    this.files.push(await readFileEntry(this.absolutePathOf(relativePath), relativePath));
    if (this.files.length > MAXIMUM_FOLDER_FILES) {
      throw new Error(
        `${this.folderPath} holds more than ${MAXIMUM_FOLDER_FILES} files, the most Overleaf's upload dialog takes at once. Copy one subfolder at a time. Nothing was copied.`,
      );
    }
    return false;
  }

  private absolutePathOf(relativePath: string): string {
    return join(this.folderPath, ...relativePath.split("/"));
  }
}

export async function readLocalFolder(sourcePath: string): Promise<LocalFolderListing> {
  const folderPath = requireVisibleAbsolutePath(sourcePath, "folder");
  const folderEntry = await stat(folderPath).catch(() => undefined);
  if (!folderEntry?.isDirectory()) throw new Error(`${folderPath} is not a folder on this computer.`);
  const walk = new LocalFolderWalk(folderPath);
  await walk.walk();
  if (walk.files.length === 0) {
    throw new Error(`${folderPath} holds no file that would be copied. Nothing was copied.`);
  }
  return {
    folderPath,
    files: [...walk.files].sort(compareRelativePaths),
    skipped: [...walk.skipped].sort(compareRelativePaths),
  };
}
