import { describe, expect, it } from "vitest";

import {
  type OverleafProjectTree,
  readProjectTree,
} from "../../../src/overleaf/realtime/overleafProjectDocuments.js";
import {
  baseNameOf,
  findFolder,
  findParentFolder,
  findTreeEntity,
  normaliseTreePath,
  parentPathOf,
} from "../../../src/overleaf/realtime/overleafTreeEntities.js";

/** A tree shaped as `ProjectEditorHandler.buildFolderModelView` builds it. */
function readTree(): OverleafProjectTree {
  const tree = readProjectTree({
    _id: "64a1b2c3d4e5f6a7b8c9d0e1",
    name: "Paper",
    rootDoc_id: "d1",
    rootFolder: [
      {
        _id: "f0",
        name: "rootFolder",
        docs: [{ _id: "d1", name: "main.tex" }],
        fileRefs: [{ _id: "b1", name: "logo.png" }],
        folders: [
          {
            _id: "f3",
            name: "sections",
            docs: [{ _id: "d2", name: "intro.tex" }],
            fileRefs: [],
            folders: [],
          },
          {
            _id: "f1",
            name: "figures",
            docs: [],
            fileRefs: [{ _id: "b2", name: "plot.pdf" }],
            folders: [{ _id: "f2", name: "old", docs: [], fileRefs: [], folders: [] }],
          },
        ],
      },
    ],
  });
  if (!tree) throw new Error("The tree did not parse.");
  return tree;
}

describe("finding what sits at a path in the project tree", () => {
  it("reads the root folder's id and every folder with its path, sorted", () => {
    const tree = readTree();
    expect(tree.rootFolderId).toBe("f0");
    expect(tree.folders).toEqual([
      { path: "figures", folderId: "f1" },
      { path: "figures/old", folderId: "f2" },
      { path: "sections", folderId: "f3" },
    ]);
    expect(tree.binaryFiles).toEqual([
      { path: "figures/plot.pdf", fileId: "b2" },
      { path: "logo.png", fileId: "b1" },
    ]);
  });

  it("names a document, an upload, a folder or the root by path", () => {
    const tree = readTree();
    expect(findTreeEntity(tree, "sections/intro.tex")).toEqual({
      type: "doc",
      id: "d2",
      path: "sections/intro.tex",
    });
    expect(findTreeEntity(tree, "./figures//plot.pdf/")).toEqual({
      type: "file",
      id: "b2",
      path: "figures/plot.pdf",
    });
    expect(findTreeEntity(tree, "figures/old")).toEqual({ type: "folder", id: "f2", path: "figures/old" });
    expect(findTreeEntity(tree, "")).toEqual({ type: "folder", id: "f0", path: "" });
    expect(findTreeEntity(tree, "missing.tex")).toBeUndefined();
  });

  it("finds the folder a new entity would go into, if it exists", () => {
    const tree = readTree();
    expect(findParentFolder(tree, "figures/new.png")).toEqual({ folderId: "f1", path: "figures" });
    expect(findParentFolder(tree, "top.tex")).toEqual({ folderId: "f0", path: "" });
    expect(findParentFolder(tree, "nowhere/new.tex")).toBeUndefined();
    expect(findFolder(tree, "main.tex")).toBeUndefined();
  });

  it("normalises paths the way a caller is likely to write them", () => {
    expect(normaliseTreePath("./a//b/")).toBe("a/b");
    expect(parentPathOf("a/b/c.tex")).toBe("a/b");
    expect(parentPathOf("c.tex")).toBe("");
    expect(baseNameOf("/a/b/c.tex")).toBe("c.tex");
  });
});
