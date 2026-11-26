import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

import type { GitCommandResult } from "../../../../src/overleaf/gitCommandRunner.js";
import { resolvePathInsideRepository } from "../../../../src/overleaf/repositoryPaths.js";
import type { ProjectDirectoryAccess } from "../../../../src/overleaf/workingTree/projectDirectories.js";

async function writeProjectTree(root: string, files: readonly string[]): Promise<void> {
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), file);
  }
}

export async function readProjectTree(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolutePath = join(entry.parentPath, entry.name);
    files.set(relative(root, absolutePath).split(sep).join("/"), await readFile(absolutePath, "utf8"));
  }
  return files;
}

function listFilesOnDisk(root: string) {
  return async (args: readonly string[]): Promise<GitCommandResult> => {
    if (args.includes("--ignored")) return { stdout: "", stderr: "", exitCode: 0 };
    const literal = (args.at(-1) ?? "").replace(/^:\(literal\)/, "");
    const files = [...(await readProjectTree(root)).keys()].filter(
      (path) => path === literal || path.startsWith(`${literal}/`),
    );
    const listed = args.includes("-t") ? files.map((path) => `H ${path}`) : files;
    return { stdout: listed.map((entry) => `${entry}\0`).join(""), stderr: "", exitCode: 0 };
  };
}

export function projectDirectoryAccess(root: string): ProjectDirectoryAccess {
  return {
    repositoryDirectory: root,
    git: listFilesOnDisk(root),
    resolveClientPath: (relativePath) =>
      Promise.resolve().then(() => resolvePathInsideRepository(root, relativePath)),
    materializePathIfNeeded: () => Promise.resolve(),
    materializeAllFiles: () => Promise.resolve(),
  };
}

export async function withProjectTree<Result>(
  files: readonly string[],
  use: (root: string) => Promise<Result>,
): Promise<Result> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "project-directories-")));
  try {
    await writeProjectTree(root, files);
    return await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
