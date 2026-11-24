import type { InputRequiredResult } from "@modelcontextprotocol/server";

import {
  type InviteRefusal,
  inviteToProject,
} from "../../../../overleaf/web/projects/sharing/projectSharing.js";
import {
  overleafPrivilegeLevelOf,
  type SharingAccessLevel,
} from "../../../../overleaf/web/projects/sharing/sharingAccessLevels.js";
import type { PersonConfirmation } from "../../../personConfirmation/personConfirmation.js";
import { describeAccessLevel } from "../../../reading/accessLevelNames.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../../toolContext.js";
import { requireOverleafWebClient } from "../../requireOverleafWebClient.js";
import { describeMember, findSharedPerson } from "./findSharedPerson.js";
import { requireOwnedProject } from "./requireOwnedProject.js";
import { invitationQuestion } from "./sharingConfirmationQuestions.js";
import { requireSharingEmailAddress } from "./sharingEmailAddress.js";

function describeRefusal(refusal: InviteRefusal, email: string, projectLabel: string): string {
  if (refusal === "no_collaborator_seat") {
    return `The owner's plan has no free editor or reviewer seat in ${projectLabel}, so Overleaf sent no invitation. A viewer needs no seat: invite with accessLevel view, or free a seat with set_access or remove_member first.`;
  }
  if (refusal === "inviting_own_address") {
    return `${email} is this account's own address, and this account owns ${projectLabel} already. Nothing was sent.`;
  }
  return `This Overleaf sends invitations only to addresses that already have an account on it, and ${email} has none. Nothing was sent.`;
}

export async function inviteToProjectAction(
  context: ToolContext,
  confirmation: PersonConfirmation,
  project: string | undefined,
  email: string,
  accessLevel: SharingAccessLevel,
): Promise<ToolTextResult | InputRequiredResult> {
  const address = requireSharingEmailAddress(email);
  const privilegeLevel = overleafPrivilegeLevelOf(accessLevel);
  const webClient = requireOverleafWebClient(context);
  const target = await requireOwnedProject(context, webClient, project);
  const { member, invites } = await findSharedPerson(webClient, target.projectId, address);
  if (member) {
    const access = describeAccessLevel(member.accessLevel);
    if (member.accessLevel === privilegeLevel) {
      return textResult(
        `${describeMember(member)} is already a member of ${target.label} with access "${access}"; nothing was sent.`,
      );
    }
    throw new Error(
      `${describeMember(member)} is already a member of ${target.label} with access "${access}"; change that with set_access. Nothing was sent.`,
    );
  }
  const [pending] = invites;
  if (pending) {
    throw new Error(
      `${pending.email} already has a pending invitation to ${target.label} (${describeAccessLevel(pending.accessLevel)}). Nothing was sent; to change its access level, withdraw it with revoke_invite and invite again, and to remind them, resend it from Overleaf's Share menu.`,
    );
  }
  const notYetConfirmed = confirmation.replyUntilConfirmed(
    invitationQuestion(target, address, privilegeLevel),
  );
  if (notYetConfirmed) return notYetConfirmed;
  const outcome = await inviteToProject(webClient, target.projectId, address, privilegeLevel);
  if (!outcome.sent) throw new Error(describeRefusal(outcome.refusal, address, target.label));
  return textResult(
    `Invited ${outcome.invite.email} to ${target.label} with access "${describeAccessLevel(outcome.invite.accessLevel)}". Overleaf has emailed them the invitation; until they accept it, read_project (view members) lists it and revoke_invite withdraws it.`,
  );
}
