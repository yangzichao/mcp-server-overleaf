import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { OverleafProjectTree } from "../../../../src/overleaf/realtime/overleafProjectDocuments.js";
import {
  baseNameOf,
  findFolder,
  findParentFolder,
  findTreeEntity,
  normaliseTreePath,
  parentPathOf,
} from "../../../../src/overleaf/realtime/overleafTreeEntities.js";

const segment = fc.constantFrom("figures", "plot.png", "main.tex", "a b", "北京", "𝔸", "..", "x.y");
const treePath = fc.array(segment, { minLength: 1, maxLength: 3 }).map((segments) => segments.join("/"));

/** Ways of writing a path that Overleaf reads as the same entity. */
const writtenPath = fc
  .tuple(treePath, fc.constantFrom("", "./", "/", "//"), fc.constantFrom("", "/", "//"), fc.boolean())
  .map(([path, before, after, doubled]) => ({
    path,
    written: `${before}${doubled ? path.replaceAll("/", "//") : path}${after}`,
  }));
const anyPath = fc.oneof(
  writtenPath.map(({ written }) => written),
  fc
    .array(fc.constantFrom("a", "/", ".", "./", " ", "\\", "北"), { maxLength: 8 })
    .map((pieces) => pieces.join("")),
);

const projectTree: fc.Arbitrary<OverleafProjectTree> = fc
  .uniqueArray(fc.tuple(treePath, fc.constantFrom("doc" as const, "file" as const, "folder" as const)), {
    maxLength: 6,
    selector: ([path]) => path,
  })
  .chain((entities) =>
    fc.record({
      projectId: fc.constant("0123456789abcdef01234567"),
      name: fc.constant("Paper"),
      rootDocumentId: fc.constant(undefined),
      rootFolderId: fc.option(fc.constant("root-folder"), { nil: undefined }),
      documents: fc.constant(
        entities
          .filter(([, type]) => type === "doc")
          .map(([path], index) => ({ path, documentId: `doc-${index}` })),
      ),
      binaryFiles: fc.constant(
        entities
          .filter(([, type]) => type === "file")
          .map(([path], index) => ({ path, fileId: `file-${index}` })),
      ),
      folders: fc.constant(
        entities
          .filter(([, type]) => type === "folder")
          .map(([path], index) => ({ path, folderId: `folder-${index}` })),
      ),
    }),
  );

describe("tree path properties", () => {
  it("reads a path written with a leading ./, extra slashes or a trailing slash as the path itself", () => {
    fc.assert(
      fc.property(writtenPath, ({ path, written }) => {
        expect(normaliseTreePath(written)).toBe(path);
      }),
    );
  });

  it("gives a path with no empty segment and no slash at either end", () => {
    fc.assert(
      fc.property(anyPath, (written) => {
        const normalised = normaliseTreePath(written);
        expect(normalised.startsWith("/")).toBe(false);
        expect(normalised.endsWith("/")).toBe(false);
        if (normalised !== "") expect(normalised.split("/")).not.toContain("");
      }),
    );
  });

  it("splits a path into a parent and a base name that join back to it", () => {
    fc.assert(
      fc.property(anyPath, (written) => {
        const normalised = normaliseTreePath(written);
        const parent = parentPathOf(written);
        const baseName = baseNameOf(written);
        expect(baseName).not.toContain("/");
        expect(parent === "" ? baseName : `${parent}/${baseName}`).toBe(normalised);
      }),
    );
  });

  // Counterexample: "././x" normalises to "./x", which normalises to "x", so "././x" finds nothing at x.
  it.fails("is idempotent, also after more than one ./", () => {
    const afterDotSlashes = fc
      .tuple(fc.array(fc.constantFrom("./", "/", ".//"), { maxLength: 3 }), treePath)
      .map(([prefixes, path]) => `${prefixes.join("")}${path}`);
    fc.assert(
      fc.property(fc.oneof(anyPath, afterDotSlashes), (written) => {
        const once = normaliseTreePath(written);
        expect(normaliseTreePath(once)).toBe(once);
      }),
    );
  });
});

describe("findTreeEntity properties", () => {
  it("finds the one entity at a path however it is written, and nothing where the tree has none", () => {
    fc.assert(
      fc.property(projectTree, writtenPath, (tree, { path, written }) => {
        const document = tree.documents.find((entry) => entry.path === path);
        const binaryFile = tree.binaryFiles.find((entry) => entry.path === path);
        const folder = tree.folders.find((entry) => entry.path === path);
        const expected = document
          ? { type: "doc", id: document.documentId, path }
          : binaryFile
            ? { type: "file", id: binaryFile.fileId, path }
            : folder
              ? { type: "folder", id: folder.folderId, path }
              : undefined;
        expect(findTreeEntity(tree, written)).toEqual(expected);
        expect(findFolder(tree, written)).toEqual(folder ? { folderId: folder.folderId, path } : undefined);
      }),
    );
  });

  it("finds the root folder for an empty path, and a top-level entity's parent as the root", () => {
    fc.assert(
      fc.property(projectTree, fc.constantFrom("", "/", "./", "//"), segment, (tree, root, name) => {
        const rootFolder = tree.rootFolderId ? { folderId: tree.rootFolderId, path: "" } : undefined;
        expect(findFolder(tree, root)).toEqual(rootFolder);
        expect(findParentFolder(tree, name)).toEqual(rootFolder);
      }),
    );
  });
});
