import { describe, expect, it } from "vitest";

import {
  fetchPendingInvites,
  fetchProjectMembers,
} from "../../../../../src/overleaf/web/projects/sharing/projectMembers.js";
import {
  FAKE_COLLABORATOR_ID,
  FAKE_REVIEWER_ID,
} from "../../../../integration/fakeWebRoutes/fakeProjectMembers.js";
import { failureOf, statusOf } from "../../support/failureOf.js";
import { useFakeOverleafConnection } from "../../support/fakeOverleafConnection.js";

describe("who a project is shared with", () => {
  const connection = useFakeOverleafConnection();

  it("lists the members, without the owner, and the pending invitations to the owner", async () => {
    const client = connection.client();
    expect(await fetchProjectMembers(client, connection.overleaf.projectId)).toEqual([
      {
        userId: FAKE_COLLABORATOR_ID,
        email: "ada@example.com",
        name: "Ada Example",
        accessLevel: "readAndWrite",
        pendingEditor: false,
        pendingReviewer: false,
      },
      {
        userId: FAKE_REVIEWER_ID,
        email: "bea@example.com",
        name: "Bea Example",
        accessLevel: "review",
        pendingEditor: false,
        pendingReviewer: false,
      },
    ]);
    expect(await fetchPendingInvites(client, connection.overleaf.projectId)).toEqual([
      {
        inviteId: "64a900000000000000000001",
        email: "invited.coauthor@example.com",
        accessLevel: "readAndWrite",
      },
    ]);
  });

  it("lists the members to an editor, and says that only the owner sees invitations", async () => {
    connection.overleaf.permissionsLevel = "readAndWrite";
    const members = await fetchProjectMembers(connection.client(), connection.overleaf.projectId);
    expect(members.map((member) => member.userId)).toEqual([
      connection.overleaf.userId,
      FAKE_COLLABORATOR_ID,
      FAKE_REVIEWER_ID,
    ]);
    const failure = await failureOf(fetchPendingInvites(connection.client(), connection.overleaf.projectId));
    expect(statusOf(failure)).toBe(403);
    expect(failure.message).toContain("only to its owner");
  });

  it("explains a refusal for a project the account cannot open", async () => {
    const failure = await failureOf(fetchProjectMembers(connection.client(), "ff".padStart(24, "0")));
    expect(statusOf(failure)).toBe(403);
    expect(failure.message).toContain("cannot open the project");
  });

  it("reports an expired session as such", async () => {
    connection.overleaf.web.sessionExpired = true;
    const failure = await failureOf(fetchProjectMembers(connection.client(), connection.overleaf.projectId));
    expect(statusOf(failure)).toBe(401);
  });
});
