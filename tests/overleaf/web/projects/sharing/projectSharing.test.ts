import { describe, expect, it } from "vitest";

import { OverleafWebRequestError } from "../../../../../src/overleaf/web/overleafWebErrors.js";
import {
  fetchPendingInvites,
  fetchProjectMembers,
} from "../../../../../src/overleaf/web/projects/sharing/projectMembers.js";
import {
  inviteToProject,
  removeProjectMember,
  revokeProjectInvite,
  setMemberAccessLevel,
} from "../../../../../src/overleaf/web/projects/sharing/projectSharing.js";
import {
  FAKE_COLLABORATOR_ID,
  FAKE_REVIEWER_ID,
} from "../../../../integration/fakeWebRoutes/fakeProjectMembers.js";
import { failureOf, statusOf } from "../../support/failureOf.js";
import { useFakeOverleafConnection } from "../../support/fakeOverleafConnection.js";

const FIRST_INVITE_ID = "64a900000000000000000001";

describe("changing who a project is shared with", () => {
  const connection = useFakeOverleafConnection();
  const projectId = () => connection.overleaf.projectId;

  it("sends an invitation and lists it as pending", async () => {
    const client = connection.client();
    const outcome = await inviteToProject(client, projectId(), "new.coauthor@example.com", "review");
    expect(outcome).toEqual({
      sent: true,
      invite: {
        inviteId: "64a900000000000000000002",
        email: "new.coauthor@example.com",
        accessLevel: "review",
      },
    });
    expect((await fetchPendingInvites(client, projectId())).map((invite) => invite.email)).toEqual([
      "invited.coauthor@example.com",
      "new.coauthor@example.com",
    ]);
    expect(connection.changesSentTo(/\/invite$/)).toEqual([`POST /project/${projectId()}/invite`]);
  });

  it("reports the three ways Overleaf declines an invitation without an error status", async () => {
    const client = connection.client();
    expect(await inviteToProject(client, projectId(), "you@example.com", "readAndWrite")).toEqual({
      sent: false,
      refusal: "inviting_own_address",
    });
    connection.overleaf.sharing.existingAccountEmails = new Set(["known@example.com"]);
    expect(await inviteToProject(client, projectId(), "stranger@example.com", "readOnly")).toEqual({
      sent: false,
      refusal: "address_has_no_account",
    });
    connection.overleaf.sharing.collaboratorSeats = 3;
    expect(await inviteToProject(client, projectId(), "known@example.com", "readAndWrite")).toEqual({
      sent: false,
      refusal: "no_collaborator_seat",
    });
    expect(connection.overleaf.sharing.invites).toHaveLength(1);
  });

  it("lets a viewer in when the plan has no seat left for an editor", async () => {
    connection.overleaf.sharing.collaboratorSeats = 3;
    const outcome = await inviteToProject(connection.client(), projectId(), "viewer@example.com", "readOnly");
    expect(outcome.sent).toBe(true);
  });

  it("explains an address Overleaf does not accept", async () => {
    const failure = await failureOf(inviteToProject(connection.client(), projectId(), "a@b", "readOnly"));
    expect(statusOf(failure)).toBe(400);
    expect(failure.message).toBe(
      "Overleaf did not accept a@b as an email address, so no invitation was sent.",
    );
  });

  it("tells bot protection apart from Overleaf's own refusal by the X-Served-By header", async () => {
    connection.overleaf.sharing.answerInvitesAsBotProtection = true;
    const blocked = await failureOf(
      inviteToProject(connection.client(), projectId(), "new.coauthor@example.com", "readOnly"),
    );
    expect(blocked.message).toContain("bot protection");
    expect(blocked.message).toContain("Share menu");

    connection.overleaf.sharing.answerInvitesAsBotProtection = false;
    connection.overleaf.permissionsLevel = "readAndWrite";
    const refused = await failureOf(
      inviteToProject(connection.client(), projectId(), "new.coauthor@example.com", "readOnly"),
    );
    expect(refused).toBeInstanceOf(OverleafWebRequestError);
    expect((refused as OverleafWebRequestError).answer).toEqual({
      reason: "restricted",
      servedBy: "web-fake-1",
    });
    expect(refused.message).not.toContain("bot protection");
  });

  it("changes a member's access level and refuses a new editor seat the plan lacks", async () => {
    const client = connection.client();
    await setMemberAccessLevel(client, projectId(), FAKE_COLLABORATOR_ID, "readOnly");
    expect((await fetchProjectMembers(client, projectId()))[0]?.accessLevel).toBe("readOnly");

    connection.overleaf.sharing.collaboratorSeats = 2;
    const failure = await failureOf(
      setMemberAccessLevel(client, projectId(), FAKE_COLLABORATOR_ID, "review"),
    );
    expect(statusOf(failure)).toBe(403);
    expect(failure.message).toContain("no free editor or reviewer seat");
    expect((await fetchProjectMembers(client, projectId()))[0]?.accessLevel).toBe("readOnly");
  });

  it("moves an editor to reviewer without needing another seat", async () => {
    connection.overleaf.sharing.collaboratorSeats = 2;
    await setMemberAccessLevel(connection.client(), projectId(), FAKE_COLLABORATOR_ID, "review");
    expect(connection.overleaf.sharing.changedPrivileges.get(FAKE_COLLABORATOR_ID)).toBe("review");
  });

  it("says when the member to change is gone", async () => {
    const failure = await failureOf(
      setMemberAccessLevel(connection.client(), projectId(), "6500000000000000000000ee", "readOnly"),
    );
    expect(statusOf(failure)).toBe(404);
    expect(failure.message).toContain("no longer has that person");
  });

  it("removes a member and withdraws an invitation", async () => {
    const client = connection.client();
    await removeProjectMember(client, projectId(), FAKE_REVIEWER_ID);
    await revokeProjectInvite(client, projectId(), FIRST_INVITE_ID);
    expect((await fetchProjectMembers(client, projectId())).map((member) => member.userId)).toEqual([
      FAKE_COLLABORATOR_ID,
    ]);
    expect(await fetchPendingInvites(client, projectId())).toEqual([]);
  });

  it("checks every id before it goes into a path", async () => {
    const client = connection.client();
    await expect(removeProjectMember(client, projectId(), "../../admin")).rejects.toThrow(
      "not an Overleaf id",
    );
    await expect(revokeProjectInvite(client, projectId(), "x")).rejects.toThrow("not an Overleaf id");
    await expect(setMemberAccessLevel(client, "nope", FAKE_COLLABORATOR_ID, "readOnly")).rejects.toThrow(
      "not an Overleaf id",
    );
    expect(connection.changesSentTo(/./)).toEqual([]);
  });
});
