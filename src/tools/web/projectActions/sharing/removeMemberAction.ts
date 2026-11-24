import { removeProjectMember } from "../../../../overleaf/web/projects/sharing/projectSharing.js";
import { describeAccessLevel } from "../../../reading/accessLevelNames.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../../toolContext.js";
import { requireOverleafWebClient } from "../../requireOverleafWebClient.js";
import { describeMember, findSharedPerson } from "./findSharedPerson.js";
import { notAMemberMessage } from "./notAMemberMessage.js";
import { requireOwnedProject } from "./requireOwnedProject.js";
import { requireSharingEmailAddress } from "./sharingEmailAddress.js";

export async function removeMemberAction(
  context: ToolContext,
  project: string | undefined,
  email: string,
): Promise<ToolTextResult> {
  const address = requireSharingEmailAddress(email);
  const webClient = requireOverleafWebClient(context);
  const target = await requireOwnedProject(context, webClient, project);
  const { member, invites } = await findSharedPerson(webClient, target.projectId, address);
  if (!member) {
    if (invites.length > 0) {
      throw new Error(
        `${address} has only a pending invitation to ${target.label}; withdraw it with revoke_invite. Nothing changed.`,
      );
    }
    throw new Error(notAMemberMessage(address, target.label));
  }
  await removeProjectMember(webClient, target.projectId, member.userId);
  return textResult(
    `Removed ${describeMember(member)}, whose access was "${describeAccessLevel(member.accessLevel)}", from ${target.label}. Bringing them back takes a new invitation.`,
  );
}
