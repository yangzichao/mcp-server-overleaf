import { stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

/** The entry at a path, or undefined when nothing is there yet. */
async function statIfPresent(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Refuses a path in the clone that cannot name a file: one that is a folder, or one inside a
 * file, such as main.tex/intro.tex. Node would answer a read or write of either with EISDIR or
 * ENOTDIR and the clone's absolute path, which tells a model nothing it can act on.
 */
export async function requireFileShapedPath(
  repositoryDirectory: string,
  relativePath: string,
  absolutePath: string,
): Promise<void> {
  const components = relative(repositoryDirectory, absolutePath).split(sep);
  let walkedPath = repositoryDirectory;
  for (const [index, component] of components.entries()) {
    walkedPath = join(walkedPath, component);
    const entry = await statIfPresent(walkedPath);
    // Nothing here yet, so nothing below it either: a write creates the rest.
    if (entry === undefined) return;
    const isLastComponent = index === components.length - 1;
    if (isLastComponent && entry.isDirectory()) throw new Error(`${relativePath} is a folder, not a file.`);
    if (!isLastComponent && !entry.isDirectory()) {
      const filePath = components.slice(0, index + 1).join("/");
      throw new Error(`${filePath} is a file, so ${relativePath} cannot be inside it.`);
    }
  }
}
