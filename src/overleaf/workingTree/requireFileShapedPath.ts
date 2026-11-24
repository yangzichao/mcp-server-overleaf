import { stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

async function statIfPresent(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

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
    if (entry === undefined) return;
    const isLastComponent = index === components.length - 1;
    if (isLastComponent && entry.isDirectory()) throw new Error(`${relativePath} is a folder, not a file.`);
    if (!isLastComponent && !entry.isDirectory()) {
      const filePath = components.slice(0, index + 1).join("/");
      throw new Error(`${filePath} is a file, so ${relativePath} cannot be inside it.`);
    }
  }
}
