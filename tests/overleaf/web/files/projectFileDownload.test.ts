import { describe, expect, it } from "vitest";

import { downloadProjectFile } from "../../../../src/overleaf/web/files/projectFileDownload.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import { FAKE_FIGURE_BYTES } from "../../../integration/fakeWebRoutes/fakeProjectTree.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";
import { requireTreeEntity } from "../support/requireTreeEntity.js";

describe("downloading one uploaded file", () => {
  const connection = useFakeOverleafConnection();
  const figureId = async (): Promise<string> =>
    requireTreeEntity((await connection.joinProject()).project, "figure.png").id;

  it("answers with the file's bytes, found through the project tree", async () => {
    const bytes = await downloadProjectFile(
      connection.client(),
      connection.overleaf.projectId,
      await figureId(),
    );
    expect(bytes).toEqual(FAKE_FIGURE_BYTES);
  });

  it("refuses a file larger than the cap the caller set", async () => {
    const failure = await failureOf(
      downloadProjectFile(connection.client(), connection.overleaf.projectId, await figureId(), 4),
    );
    expect(failure.message).toContain(`Overleaf offered ${FAKE_FIGURE_BYTES.length} bytes`);
    expect(failure.message).toContain("more than the 4 this server will download");
  });

  it("reports an unknown file as nothing there, and refuses an id that is not one", async () => {
    const unknown = await failureOf(
      downloadProjectFile(connection.client(), connection.overleaf.projectId, "0".repeat(24)),
    );
    expect(statusOf(unknown)).toBe(404);
    const notAnId = await failureOf(
      downloadProjectFile(connection.client(), connection.overleaf.projectId, "x"),
    );
    expect(notAnId).toBeInstanceOf(RequestNotSentError);
  });
});
