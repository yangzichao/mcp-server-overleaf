import { describe, expect, it } from "vitest";

import { fetchAccountProjects } from "../../../../src/overleaf/web/accountProjects.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import {
  createTag,
  fetchTags,
  tagProjectByName,
  untagProjectByName,
} from "../../../../src/overleaf/web/projects/projectTags.js";
import { failureOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";

const SHARED_THESIS_ID = "64b000000000000000000002";

describe("the account's project tags", () => {
  const connection = useFakeOverleafConnection();
  const tagsOf = async (projectId: string): Promise<readonly string[] | undefined> =>
    (await fetchAccountProjects(connection.client(), { includeTags: true })).find(
      (project) => project.projectId === projectId,
    )?.tags;

  it("creates a tag once and answers with the same tag for a name already in use", async () => {
    const first = await createTag(connection.client(), "Submitted", "#1a2b3c");
    const again = await createTag(connection.client(), "Submitted");
    expect(first).toMatchObject({ name: "Submitted", color: "#1a2b3c", projectIds: [] });
    expect(again.tagId).toBe(first.tagId);
    expect(await fetchTags(connection.client())).toHaveLength(1);
  });

  it("tags and untags a project by name, and the project list shows its tags when asked", async () => {
    const client = connection.client();
    await tagProjectByName(client, SHARED_THESIS_ID, "Thesis");
    await tagProjectByName(client, SHARED_THESIS_ID, "2026");
    expect(await tagsOf(SHARED_THESIS_ID)).toEqual(["Thesis", "2026"]);
    const untagged = await fetchAccountProjects(client);
    expect(untagged.find((project) => project.projectId === SHARED_THESIS_ID)?.tags).toEqual([]);
    await untagProjectByName(client, SHARED_THESIS_ID, "Thesis");
    expect(await tagsOf(SHARED_THESIS_ID)).toEqual(["2026"]);
  });

  it("refuses to untag by a name the account has no tag for, which Overleaf would answer as a success", async () => {
    const failure = await failureOf(untagProjectByName(connection.client(), SHARED_THESIS_ID, "Nope"));
    expect(failure).toBeInstanceOf(RequestNotSentError);
    expect(connection.changesSentTo(/^\/tag/)).toEqual([]);
  });

  it("refuses names and colours Overleaf would refuse", async () => {
    const attempts = [
      () => createTag(connection.client(), ""),
      () => createTag(connection.client(), "x".repeat(51)),
      () => createTag(connection.client(), "Fine", "red"),
    ];
    for (const attempt of attempts) expect(await failureOf(attempt())).toBeInstanceOf(RequestNotSentError);
    expect(connection.changesSentTo(/^\/tag/)).toEqual([]);
  });
});
