import { describe, expect, it } from "vitest";

import { fetchAccountProjects } from "../../../src/overleaf/web/accountProjects.js";
import { useFakeOverleafConnection } from "./support/fakeOverleafConnection.js";

describe("listing the account's projects", () => {
  const connection = useFakeOverleafConnection();
  const requestsTo = (path: string): string[] =>
    connection.overleaf.web.requests
      .filter((request) => request.path === path)
      .map((request) => request.method);

  it("uses the light list by default and the project list's own route for archived or trashed ones", async () => {
    const plain = await fetchAccountProjects(connection.client());
    expect(plain.map((project) => project.name)).toEqual(["Fake paper", "Shared Thesis", "Grant Proposal"]);
    expect(plain[1]).toEqual({
      projectId: "64b000000000000000000002",
      name: "Shared Thesis",
      accessLevel: "readWrite",
      archived: false,
      trashed: false,
      tags: [],
    });
    expect(requestsTo("/user/projects")).toEqual(["GET"]);
    await fetchAccountProjects(connection.client(), { includeTrashed: true });
    expect(requestsTo("/api/project")).toEqual(["POST"]);
    expect(requestsTo("/tag")).toEqual([]);
  });
});
