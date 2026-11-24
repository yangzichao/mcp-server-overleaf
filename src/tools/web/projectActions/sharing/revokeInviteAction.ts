import { revokeProjectInvite } from "../../../../overleaf/web/projects/sharing/projectSharing.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../../toolContext.js";
import { requireOverleafWebClient } from "../../requireOverleafWebClient.js";
import { describeMember, findSharedPerson } from "./findSharedPerson.js";
import { requireOwnedProject } from "./requireOwnedProject.js";
import { requireSharingEmailAddress } from "./sharingEmailAddress.js";

export async function revokeInviteAction(
  context: ToolContext,
  project: string | undefined,
  email: string,
): Promise<ToolTextResult> {
  const address = requireSharingEmailAddress(email);
  const webClient = requireOverleafWebClient(context);
  const target = await requireOwnedProject(context, webClient, project);
  const { member, invites } = await findSharedPerson(webClient, target.projectId, address);
  if (invites.length === 0) {
    if (member) {
      throw new Error(
        `${describeMember(member)} accepted the invitation to ${target.label} already; take their access away with remove_member. Nothing changed.`,
      );
    }
    throw new Error(`${target.label} has no pending invitation for ${address}; nothing changed.`);
  }
  for (const invite of invites) await revokeProjectInvite(webClient, target.projectId, invite.inviteId);
  const withdrawn = invites.length === 1 ? "the invitation" : `${invites.length} invitations`;
  return textResult(
    `Withdrew ${withdrawn} to ${address} for ${target.label}; the link in Overleaf's email no longer opens the project.`,
  );
}
