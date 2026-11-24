import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkEntityName } from "../../../../src/overleaf/web/files/entityNameRules.js";
import {
  planFolderUploadTargets,
  readFolderUploadDestination,
} from "../../../../src/tools/editing/folderUpload/folderUploadTargets.js";
import type { LocalFolderFile } from "../../../../src/tools/editing/folderUpload/readLocalFolder.js";

const ordinaryName = fc.oneof(
  fc.constantFrom("main.tex", "figures", "plots", "a b", "naïve.tex", "x..y", "北京.png"),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/),
);
const awkwardName = fc.constantFrom(
  "",
  ".",
  "..",
  "a*b",
  "a\\b",
  " lead",
  "trail ",
  "😀.png",
  "__proto__",
  "\u0001",
);
const name = fc.oneof({ arbitrary: ordinaryName, weight: 4 }, { arbitrary: awkwardName, weight: 1 });
const relativePath = fc.array(name, { minLength: 1, maxLength: 4 }).map((names) => names.join("/"));
const destinationArgument = fc.oneof(
  fc.constantFrom("", ".", "./", "/", "figures", "./figures/plots/", "figures//plots", "../outside"),
  relativePath,
);

function isAllowedName(candidate: string): boolean {
  try {
    checkEntityName(candidate);
    return true;
  } catch {
    return false;
  }
}

function localFile(path: string): LocalFolderFile {
  return { relativePath: path, absolutePath: `/Users/me/paper/${path}`, size: 1 };
}

describe("where upload_folder puts each file", () => {
  it("puts every file below the destination, keeping its subfolders, or refuses the whole upload", () => {
    fc.assert(
      fc.property(
        destinationArgument,
        fc.uniqueArray(relativePath, { minLength: 1, maxLength: 6 }),
        (argument, paths) => {
          const destination = readFolderUploadDestination(argument);
          const files = paths.map(localFile);
          const allNamesAllowed = files.every((file) =>
            [...(destination ? destination.split("/") : []), ...file.relativePath.split("/")].every(
              isAllowedName,
            ),
          );
          let targets: ReturnType<typeof planFolderUploadTargets>;
          try {
            targets = planFolderUploadTargets(destination, files);
          } catch (error) {
            expect(allNamesAllowed).toBe(false);
            expect((error as Error).message).toContain("Nothing was copied.");
            return;
          }
          expect(allNamesAllowed).toBe(true);
          expect(targets.map((target) => target.file)).toEqual(files);
          for (const target of targets) {
            const expected = destination
              ? `${destination}/${target.file.relativePath}`
              : target.file.relativePath;
            expect(target.projectPath).toBe(expected);
            expect(target.projectPath.split("/")).not.toContain("..");
            expect(target.projectPath.startsWith("/")).toBe(false);
          }
        },
      ),
    );
  });

  it('reads ".", "./", "/" and "" as the project root, and normalises the rest as a tree path', () => {
    for (const root of ["", " ", ".", "./", "/", " . "]) expect(readFolderUploadDestination(root)).toBe("");
    expect(readFolderUploadDestination("./figures//plots/")).toBe("figures/plots");
  });
});
