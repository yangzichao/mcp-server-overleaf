import { describe, expect, it } from "vitest";

import { findFolder, findTreeEntity } from "../../../../src/overleaf/realtime/overleafTreeEntities.js";
import { downloadProjectFile } from "../../../../src/overleaf/web/files/projectFileDownload.js";
import {
  MAXIMUM_FILE_UPLOAD_BYTES,
  uploadProjectFile,
} from "../../../../src/overleaf/web/files/projectFileUpload.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";
import { requireRootFolderId, requireTreeEntity } from "../support/requireTreeEntity.js";

const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("uploading a file into the project", () => {
  const connection = useFakeOverleafConnection();
  const projectId = (): string => connection.overleaf.projectId;
  const currentTree = async () => (await connection.joinProject()).project;
  const upload = async (relativePath: string, bytes: Buffer) =>
    await uploadProjectFile(connection.client(), projectId(), {
      folderId: requireRootFolderId(await currentTree()),
      relativePath,
      bytes,
    });

  it("stores a binary file, which reads back byte for byte", async () => {
    const uploaded = await upload("photo.jpg", PHOTO_BYTES);
    expect(uploaded.entityType).toBe("file");
    expect(findTreeEntity(await currentTree(), "photo.jpg")).toEqual({
      type: "file",
      id: uploaded.entityId,
      path: "photo.jpg",
    });
    expect(await downloadProjectFile(connection.client(), projectId(), uploaded.entityId)).toEqual(
      PHOTO_BYTES,
    );
  });

  it("creates the folders a nested path names, as Overleaf does for a dropped folder", async () => {
    const uploaded = await upload("figures/plots/loss.png", PHOTO_BYTES);
    const tree = await currentTree();
    expect(findFolder(tree, "figures/plots")).toBeDefined();
    expect(findTreeEntity(tree, "figures/plots/loss.png")?.id).toBe(uploaded.entityId);
  });

  it("stores a .tex upload as an editable document, replacing the document already at that path", async () => {
    const introduction = requireTreeEntity(await currentTree(), "sections/introduction.tex");
    const uploaded = await upload(
      "sections/introduction.tex",
      Buffer.from("\\section{Introduction, again}\n"),
    );
    expect(uploaded).toEqual({ entityId: introduction.id, entityType: "doc" });
    expect(connection.overleaf.documentText(introduction.id)).toBe("\\section{Introduction, again}\n");
  });

  it("gives a replaced binary file a new id, as Overleaf swaps in a new file", async () => {
    const figure = requireTreeEntity(await currentTree(), "figure.png");
    const uploaded = await upload("figure.png", PHOTO_BYTES);
    expect(uploaded.entityId).not.toBe(figure.id);
    expect(requireTreeEntity(await currentTree(), "figure.png").id).toBe(uploaded.entityId);
  });

  it("refuses a file larger than Overleaf takes, or a name it would refuse, before sending anything", async () => {
    const tooLarge = await failureOf(upload("big.pdf", Buffer.alloc(MAXIMUM_FILE_UPLOAD_BYTES + 1)));
    expect(tooLarge).toBeInstanceOf(RequestNotSentError);
    expect(await failureOf(upload("figures/../evil.png", PHOTO_BYTES))).toBeInstanceOf(RequestNotSentError);
    expect(connection.changesSentTo(/upload/)).toEqual([]);
  });

  it("passes on Overleaf's refusal for read-only access", async () => {
    const root = requireRootFolderId(await currentTree());
    connection.overleaf.permissionsLevel = "readOnly";
    const failure = await failureOf(
      uploadProjectFile(connection.client(), projectId(), {
        folderId: root,
        relativePath: "a.png",
        bytes: PHOTO_BYTES,
      }),
    );
    expect(statusOf(failure)).toBe(403);
  });
});
