import { describe, expect, it } from "vitest";

import { findParentFolder, findTreeEntity } from "../../../../src/overleaf/realtime/overleafTreeEntities.js";
import {
  createDocument,
  createFolder,
  deleteEntity,
  moveEntity,
  renameEntity,
} from "../../../../src/overleaf/web/files/projectFileTree.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import { FAKE_ROOT_FOLDER_ID } from "../../../integration/fakeWebRoutes/fakeProjectTree.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";
import { requireRootFolderId, requireTreeEntity } from "../support/requireTreeEntity.js";

describe("changing the project's files and folders without Git", () => {
  const connection = useFakeOverleafConnection();
  const projectId = (): string => connection.overleaf.projectId;
  const currentTree = async () => (await connection.joinProject()).project;

  it("reads the folders and uploads the editor connection describes", async () => {
    const tree = await currentTree();
    expect(tree.rootFolderId).toBe(FAKE_ROOT_FOLDER_ID);
    expect(tree.folders.map((folder) => folder.path)).toEqual(["sections"]);
    expect(tree.binaryFiles.map((file) => file.path)).toEqual(["figure.png"]);
  });

  it("creates a folder and a document in it, and the next editor connection sees both", async () => {
    const client = connection.client();
    const folderId = await createFolder(
      client,
      projectId(),
      requireRootFolderId(await currentTree()),
      "chapters",
    );
    const documentId = await createDocument(client, projectId(), folderId, "results.tex");
    const tree = await currentTree();
    expect(findTreeEntity(tree, "chapters")).toEqual({ type: "folder", id: folderId, path: "chapters" });
    expect(findTreeEntity(tree, "chapters/results.tex")).toEqual({
      type: "doc",
      id: documentId,
      path: "chapters/results.tex",
    });
    expect(findParentFolder(tree, "chapters/discussion.tex")?.folderId).toBe(folderId);
  });

  it("renames a document, and renaming a folder renames everything inside it", async () => {
    const client = connection.client();
    const tree = await currentTree();
    await renameEntity(client, projectId(), requireTreeEntity(tree, "main.tex"), "paper.tex");
    await renameEntity(client, projectId(), requireTreeEntity(tree, "sections"), "parts");
    const renamed = await currentTree();
    expect(renamed.documents.map((document) => document.path)).toEqual([
      "paper.tex",
      "parts/introduction.tex",
    ]);
    expect(renamed.folders.map((folder) => folder.path)).toEqual(["parts"]);
  });

  it("moves a file into a folder, and passes on Overleaf's refusal to move a folder into itself", async () => {
    const client = connection.client();
    const tree = await currentTree();
    const sections = requireTreeEntity(tree, "sections");
    await moveEntity(client, projectId(), requireTreeEntity(tree, "figure.png"), sections.id);
    const drafts = await createFolder(client, projectId(), sections.id, "drafts");
    const failure = await failureOf(moveEntity(client, projectId(), sections, drafts));
    expect(statusOf(failure)).toBe(400);
    expect(failure.message).toContain("destination folder is a child folder of me");
    expect((await currentTree()).binaryFiles.map((file) => file.path)).toEqual(["sections/figure.png"]);
  });

  it("deletes a file, and a folder with everything in it", async () => {
    const client = connection.client();
    const tree = await currentTree();
    await deleteEntity(client, projectId(), requireTreeEntity(tree, "figure.png"));
    await deleteEntity(client, projectId(), requireTreeEntity(tree, "sections"));
    const after = await currentTree();
    expect(after.binaryFiles).toEqual([]);
    expect(after.folders).toEqual([]);
    expect(after.documents.map((document) => document.path)).toEqual(["main.tex"]);
  });

  it("passes on Overleaf's reason when the name is already taken", async () => {
    const root = requireRootFolderId(await currentTree());
    const failure = await failureOf(createDocument(connection.client(), projectId(), root, "main.tex"));
    expect(statusOf(failure)).toBe(400);
    expect(failure.message).toContain("file already exists");
  });

  it("refuses names Overleaf would refuse before sending anything", async () => {
    const root = requireRootFolderId(await currentTree());
    const names = [
      "",
      "a/b",
      "notes*.tex",
      "plot\u0007.png",
      "figure 😀.png",
      "..",
      "draft.tex ",
      "x".repeat(150),
      "__proto__",
    ];
    for (const name of names) {
      const failure = await failureOf(createFolder(connection.client(), projectId(), root, name));
      expect(failure, JSON.stringify(name)).toBeInstanceOf(RequestNotSentError);
    }
    expect(connection.changesSentTo(/folder/)).toEqual([]);
  });

  it("passes on Overleaf's refusals for read-only access and for an id it does not know", async () => {
    const main = requireTreeEntity(await currentTree(), "main.tex");
    connection.overleaf.permissionsLevel = "readOnly";
    expect(statusOf(await failureOf(deleteEntity(connection.client(), projectId(), main)))).toBe(403);
    connection.overleaf.permissionsLevel = "owner";
    const unknown = { type: "doc", id: "0".repeat(24) } as const;
    expect(statusOf(await failureOf(renameEntity(connection.client(), projectId(), unknown, "x.tex")))).toBe(
      404,
    );
  });
});
