import { describe, expect, it } from "vitest";

import { fetchAccountProjects } from "../../../../src/overleaf/web/accountProjects.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import {
  createProjectFromZip,
  MAXIMUM_PROJECT_UPLOAD_BYTES,
} from "../../../../src/overleaf/web/projects/projectFromZip.js";
import { FAKE_ZIP_BYTES } from "../../../integration/fakeOverleafAccount.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";

describe("a new project from a ZIP archive", () => {
  const connection = useFakeOverleafConnection();

  it("names the upload after the project and answers with the new project's id", async () => {
    const projectId = await createProjectFromZip(connection.client(), " Imported paper ", FAKE_ZIP_BYTES);
    const [upload] = connection.overleaf.web.lifecycle.projectUploads;
    expect(upload?.fields.get("name")).toBe("Imported paper.zip");
    expect(upload?.size).toBe(FAKE_ZIP_BYTES.length);
    expect(await fetchAccountProjects(connection.client())).toContainEqual(
      expect.objectContaining({ projectId, name: "Imported paper", accessLevel: "owner" }),
    );
  });

  it("refuses a file that is not a ZIP archive, or one larger than Overleaf takes, without uploading", async () => {
    const notZip = await failureOf(
      createProjectFromZip(connection.client(), "Paper", Buffer.from("\\documentclass{article}")),
    );
    expect(notZip).toBeInstanceOf(RequestNotSentError);
    const oversized = Buffer.alloc(MAXIMUM_PROJECT_UPLOAD_BYTES + 1);
    FAKE_ZIP_BYTES.copy(oversized);
    const tooLarge = await failureOf(createProjectFromZip(connection.client(), "Paper", oversized));
    expect(tooLarge).toBeInstanceOf(RequestNotSentError);
    expect(tooLarge.message).toContain(`up to ${MAXIMUM_PROJECT_UPLOAD_BYTES} bytes`);
    expect(connection.changesSentTo(/upload/)).toEqual([]);
  });

  it("refuses a project name Overleaf would refuse", async () => {
    expect(await failureOf(createProjectFromZip(connection.client(), "a/b", FAKE_ZIP_BYTES))).toBeInstanceOf(
      RequestNotSentError,
    );
  });

  it("passes on Overleaf's reason when it cannot use the archive", async () => {
    connection.overleaf.web.lifecycle.rejectNextProjectUpload = "The zip file has no files in it";
    const failure = await failureOf(createProjectFromZip(connection.client(), "Paper", FAKE_ZIP_BYTES));
    expect(statusOf(failure)).toBe(422);
    expect(failure.message).toContain("The zip file has no files in it");
  });
});
