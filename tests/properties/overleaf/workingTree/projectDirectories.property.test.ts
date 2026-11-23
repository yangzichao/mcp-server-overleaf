import { posix } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ProjectDirectories } from "../../../../src/overleaf/workingTree/projectDirectories.js";
import { projectDirectoryAccess, readProjectTree, withProjectTree } from "./projectTreeOnDisk.js";

/**
 * Directory and file names never coincide, so no path is both, and none differ only in case,
 * which a case-insensitive disk would merge.
 */
const DIRECTORY_NAMES = ["a", "b", "fig", "figures", "x y", "é", "a.b"];
const FILE_NAMES = ["main.tex", "refs.bib", "plot.png", ".hidden"];

const projectFile = fc
  .tuple(fc.array(fc.constantFrom(...DIRECTORY_NAMES), { maxLength: 3 }), fc.constantFrom(...FILE_NAMES))
  .map(([directories, file]) => [...directories, file].join("/"));

const projectFiles = fc
  .uniqueArray(projectFile, { minLength: 1, maxLength: 8 })
  .filter((files) => files.some((file) => file.includes("/")));

function directoriesOf(files: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const file of files) {
    const segments = file.split("/");
    for (let length = 1; length < segments.length; length += 1) {
      directories.add(segments.slice(0, length).join("/"));
    }
  }
  return [...directories].sort();
}

function spelled(path: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(fc.constantFrom("", "./"), path, fc.constantFrom("", "/"))
    .map(([before, written, after]) => `${before}${written}${after}`);
}

const anyPath = fc
  .array(fc.constantFrom(...DIRECTORY_NAMES, ...FILE_NAMES), { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("/"));

function gitPathOf(written: string): string {
  return posix.normalize(written.trim()).replace(/\/$/, "");
}

function isUnder(path: string, directory: string): boolean {
  return path.startsWith(`${directory}/`);
}

type PathKind = "file" | "directory" | "missing";

function kindOf(files: readonly string[], path: string): PathKind {
  if (files.includes(path)) return "file";
  return files.some((file) => isUnder(file, path)) ? "directory" : "missing";
}

const treeWithPath = projectFiles.chain((files) =>
  fc.record({ files: fc.constant(files), path: spelled(fc.oneof(fc.constantFrom(...files), anyPath)) }),
);

const treeWithMove = projectFiles.chain((files) => {
  const directories = directoriesOf(files);
  const from = fc.constantFrom(...directories);
  const inside = fc.tuple(from, anyPath).map(([directory, rest]) => `${directory}/${rest}`);
  return fc.record({
    files: fc.constant(files),
    from: spelled(from),
    to: spelled(
      fc.oneof(
        anyPath,
        from,
        inside,
        fc.constantFrom(...files).map((file) => `${file}/moved`),
      ),
    ),
  });
});

const treeWithDirectory = projectFiles.chain((files) =>
  fc.record({ files: fc.constant(files), directory: spelled(fc.constantFrom(...directoriesOf(files))) }),
);

describe("ProjectDirectories properties", () => {
  it("names a file as a file, a directory as a directory, and any other path as missing", async () => {
    await fc.assert(
      fc.asyncProperty(treeWithPath, async ({ files, path }) => {
        await withProjectTree(files, async (root) => {
          const directories = new ProjectDirectories(projectDirectoryAccess(root));
          expect(await directories.describePathKind(path)).toBe(kindOf(files, gitPathOf(path)));
        });
      }),
    );
  });

  it("moves every file under a directory to the same place under the new path, or refuses and moves nothing", async () => {
    await fc.assert(
      fc.asyncProperty(treeWithMove, async ({ files, from, to }) => {
        await withProjectTree(files, async (root) => {
          const directories = new ProjectDirectories(projectDirectoryAccess(root));
          const fromPath = gitPathOf(from);
          const toPath = gitPathOf(to);
          const moving = directories.moveDirectory(from, to);
          if (toPath === fromPath || isUnder(toPath, fromPath)) {
            await expect(moving).rejects.toThrow("cannot be moved into itself. Nothing was moved.");
          } else if (kindOf(files, toPath) !== "missing") {
            await expect(moving).rejects.toThrow("already exists. Nothing was moved.");
          } else if (files.some((file) => isUnder(toPath, file))) {
            await expect(moving).rejects.toThrow();
          } else {
            const movedFrom = files.filter((file) => isUnder(file, fromPath)).sort();
            const movedTo = movedFrom.map((file) => `${toPath}${file.slice(fromPath.length)}`);
            expect(await moving).toEqual(movedTo);
            const expectedTree = new Map(
              files.map((file) => [
                isUnder(file, fromPath) ? `${toPath}${file.slice(fromPath.length)}` : file,
                file,
              ]),
            );
            expect(await readProjectTree(root)).toEqual(expectedTree);
            return;
          }
          expect(await readProjectTree(root)).toEqual(new Map(files.map((file) => [file, file])));
        });
      }),
    );
  });

  it("deletes exactly the files under a directory and answers with them", async () => {
    await fc.assert(
      fc.asyncProperty(treeWithDirectory, async ({ files, directory }) => {
        await withProjectTree(files, async (root) => {
          const directories = new ProjectDirectories(projectDirectoryAccess(root));
          const directoryPath = gitPathOf(directory);
          const removed = files.filter((file) => isUnder(file, directoryPath)).sort();
          expect(await directories.deleteDirectory(directory)).toEqual(removed);
          const kept = files.filter((file) => !isUnder(file, directoryPath));
          expect(await readProjectTree(root)).toEqual(new Map(kept.map((file) => [file, file])));
        });
      }),
    );
  });
});
