import { requireOverleafId } from "../../overleafIds.js";
import type { OverleafWebClient } from "../../overleafWebClient.js";
import { OverleafWebRequestError } from "../../overleafWebErrors.js";
import { type PendingProjectInvite, readInvite } from "./projectMembers.js";

/**
 * Changing who a project is shared with, the way the Share menu does it (`share-api.ts`), on the
 * routes `CollaboratorsRouter.mjs` keeps for the project's owner.
 */

export type InviteRefusal = "inviting_own_address" | "address_has_no_account" | "no_collaborator_seat";

export type InviteOutcome =
  | { readonly sent: true; readonly invite: PendingProjectInvite }
  | { readonly sent: false; readonly refusal: InviteRefusal };

const SEAT_LIMIT_REASON = "edit collaborator limit reached";

export async function inviteToProject(
  client: OverleafWebClient,
  projectId: string,
  email: string,
  privilegeLevel: string,
): Promise<InviteOutcome> {
  const id = requireOverleafId(projectId, "Project id");
  let answer: unknown;
  try {
    answer = await client.postJson(`/project/${id}/invite`, { email, privileges: privilegeLevel });
  } catch (error) {
    throw explainInviteFailure(error, email);
  }
  return readInviteAnswer(answer);
}

function readInviteAnswer(answer: unknown): InviteOutcome {
  const { invite, error } = (answer && typeof answer === "object" ? answer : {}) as {
    invite?: unknown;
    error?: unknown;
  };
  const sentInvite = readInvite(invite);
  if (sentInvite) return { sent: true, invite: sentInvite };
  if (invite === null) {
    if (error === undefined) return { sent: false, refusal: "no_collaborator_seat" };
    if (error === "cannot_invite_self") return { sent: false, refusal: "inviting_own_address" };
    if (error === "cannot_invite_non_user") return { sent: false, refusal: "address_has_no_account" };
    throw new OverleafWebRequestError(
      `Overleaf did not send the invitation: ${typeof error === "string" ? error : JSON.stringify(error)}.`,
      200,
    );
  }
  throw new OverleafWebRequestError(
    "Overleaf answered the invitation in a way this server does not recognise, so it cannot tell whether one was sent.",
    200,
    "Check the project's pending invitations before inviting again.",
  );
}

function explainInviteFailure(error: unknown, email: string): unknown {
  if (!(error instanceof OverleafWebRequestError)) return error;
  if (error.status === 400 && error.answer.errorReason === "invalid_email") {
    return new OverleafWebRequestError(
      `Overleaf did not accept ${email} as an email address, so no invitation was sent.`,
      400,
    );
  }
  if (error.status === 429) {
    return new OverleafWebRequestError(
      "Overleaf limits how many invitations an account and a project send, and this one reached the limit, so no invitation was sent.",
      429,
      "Wait up to half an hour before inviting anyone else.",
    );
  }
  if (error.status === 403 && error.answer.servedBy === undefined) {
    return new OverleafWebRequestError(
      "Overleaf, or the bot protection in front of it, refused the invitation with status 403, so none was sent.",
      403,
      "overleaf.com answers this way when it wants a person to solve a captcha, which this server never does: send the invitation from the project's Share menu.",
    );
  }
  return error;
}

export async function setMemberAccessLevel(
  client: OverleafWebClient,
  projectId: string,
  userId: string,
  privilegeLevel: string,
): Promise<void> {
  const id = requireOverleafId(projectId, "Project id");
  const memberId = requireOverleafId(userId, "User id");
  try {
    await client.putIgnoringAnswer(`/project/${id}/users/${memberId}`, { privilegeLevel });
  } catch (error) {
    if (!(error instanceof OverleafWebRequestError)) throw error;
    if (error.status === 403 && error.answer.reason === SEAT_LIMIT_REASON) {
      throw new OverleafWebRequestError(
        "The owner's plan has no free editor or reviewer seat in this project, so Overleaf kept the old access level.",
        403,
        "Make another editor or reviewer a viewer, remove one, or upgrade the owner's plan.",
      );
    }
    if (error.status === 404) {
      throw new OverleafWebRequestError(
        "Overleaf no longer has that person as a member of the project, so nothing changed.",
        404,
      );
    }
    throw error;
  }
}

export async function removeProjectMember(
  client: OverleafWebClient,
  projectId: string,
  userId: string,
): Promise<void> {
  const id = requireOverleafId(projectId, "Project id");
  const memberId = requireOverleafId(userId, "User id");
  await client.delete(`/project/${id}/users/${memberId}`);
}

export async function revokeProjectInvite(
  client: OverleafWebClient,
  projectId: string,
  inviteId: string,
): Promise<void> {
  const id = requireOverleafId(projectId, "Project id");
  const invite = requireOverleafId(inviteId, "Invite id");
  await client.delete(`/project/${id}/invite/${invite}`);
}
