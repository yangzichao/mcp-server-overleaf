import { describe, expect, it } from "vitest";

import { fetchAccountProjects } from "../../../../src/overleaf/web/accountProjects.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import {
  copyProject,
  renameProject,
  setProjectArchived,
  setProjectTrashed,
} from "../../../../src/overleaf/web/projects/projectLifecycle.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";

const SHARED_THESIS_ID = "64b000000000000000000002";

describe("renaming, copying, archiving and trashing a project", () => {
  const connection = useFakeOverleafConnection();
  const listedIds = async (options = {}): Promise<string[]> =>
    (await fetchAccountProjects(connection.client(), options)).map((project) => project.projectId);

  it("renames the project, trimming the name as Overleaf does, and the editor sees the new name", async () => {
    await renameProject(connection.client(), connection.overleaf.projectId, "  Camera-ready  ");
    expect((await connection.joinProject()).project.name).toBe("Camera-ready");
    const projects = await fetchAccountProjects(connection.client());
    expect(projects.find((project) => project.projectId === connection.overleaf.projectId)?.name).toBe(
      "Camera-ready",
    );
  });

  it("refuses a name Overleaf would refuse, without sending anything", async () => {
    for (const name of ["   ", "a/b", "a\\b", "x".repeat(151)]) {
      const failure = await failureOf(
        renameProject(connection.client(), connection.overleaf.projectId, name),
      );
      expect(failure).toBeInstanceOf(RequestNotSentError);
    }
    expect(connection.changesSentTo(/rename/)).toEqual([]);
  });

  it("passes on Overleaf's refusal when the account is not the owner", async () => {
    const failure = await failureOf(renameProject(connection.client(), SHARED_THESIS_ID, "Mine now"));
    expect(statusOf(failure)).toBe(403);
    expect(failure.message).toContain("does not have permission");
  });

  it("copies a project and answers with the copy's id and name", async () => {
    const copy = await copyProject(connection.client(), SHARED_THESIS_ID, "Thesis draft 2");
    expect(copy.name).toBe("Thesis draft 2");
    expect(await fetchAccountProjects(connection.client())).toContainEqual(
      expect.objectContaining({ projectId: copy.projectId, name: "Thesis draft 2", accessLevel: "owner" }),
    );
  });

  it("archives and unarchives, and only the archive listing shows an archived project", async () => {
    const client = connection.client();
    await setProjectArchived(client, SHARED_THESIS_ID, true);
    expect(await listedIds()).not.toContain(SHARED_THESIS_ID);
    const withArchived = await fetchAccountProjects(client, { includeArchived: true });
    expect(withArchived.find((project) => project.projectId === SHARED_THESIS_ID)).toMatchObject({
      archived: true,
      trashed: false,
    });
    await setProjectArchived(client, SHARED_THESIS_ID, false);
    expect(await listedIds()).toContain(SHARED_THESIS_ID);
  });

  it("trashes and restores, and trashing an archived project takes it out of the archive", async () => {
    const client = connection.client();
    await setProjectArchived(client, SHARED_THESIS_ID, true);
    await setProjectTrashed(client, SHARED_THESIS_ID, true);
    const listed = await fetchAccountProjects(client, { includeArchived: true, includeTrashed: true });
    expect(listed.find((project) => project.projectId === SHARED_THESIS_ID)).toMatchObject({
      archived: false,
      trashed: true,
    });
    expect(await listedIds({ includeArchived: true })).not.toContain(SHARED_THESIS_ID);
    await setProjectTrashed(client, SHARED_THESIS_ID, false);
    expect(await listedIds()).toContain(SHARED_THESIS_ID);
    expect(connection.changesSentTo(/\/(archive|trash)$/)).toEqual([
      `POST /Project/${SHARED_THESIS_ID}/archive`,
      `POST /project/${SHARED_THESIS_ID}/trash`,
      `DELETE /project/${SHARED_THESIS_ID}/trash`,
    ]);
  });

  it("refuses a project id that is not one before building a path from it", async () => {
    const failure = await failureOf(setProjectTrashed(connection.client(), "../user/settings", true));
    expect(failure).toBeInstanceOf(RequestNotSentError);
  });

  it("reports an expired session as such", async () => {
    connection.overleaf.web.sessionExpired = true;
    const failure = await failureOf(copyProject(connection.client(), SHARED_THESIS_ID, "Copy"));
    expect(statusOf(failure)).toBe(401);
  });
});
