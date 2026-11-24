import { readFile } from "node:fs/promises";

import { describeLocalReadProblem } from "./describeLocalReadProblem.js";
import type { FolderUploadTarget } from "./folderUploadTargets.js";

export async function readFolderUploadFile(target: FolderUploadTarget): Promise<Buffer> {
  try {
    return await readFile(target.file.absolutePath);
  } catch (error) {
    throw new Error(`Could not read ${target.file.absolutePath}: ${describeLocalReadProblem(error)}.`);
  }
}
