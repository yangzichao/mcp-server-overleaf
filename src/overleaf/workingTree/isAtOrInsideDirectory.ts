import { realpath } from "node:fs/promises";
import { sep } from "node:path";

import { realPathOfNearestExistingAncestor } from "../realPathOfNearestExistingAncestor.js";

/**
 * The real paths are compared, not the paths as written: on a disk that ignores case or Unicode
 * normalization, as macOS does by default, Sections/sub is inside sections.
 */
export async function isAtOrInsideDirectory(path: string, directory: string): Promise<boolean> {
  const realDirectory = await realpath(directory);
  const realPath = await realPathOfNearestExistingAncestor(path);
  return realPath === realDirectory || realPath.startsWith(`${realDirectory}${sep}`);
}
