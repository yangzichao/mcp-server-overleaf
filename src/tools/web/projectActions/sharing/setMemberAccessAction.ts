import type { InputRequiredResult } from "@modelcontextprotocol/server";

import { setMemberAccessLevel } from "../../../../overleaf/web/projects/sharing/projectSharing.js";
import {
  overleafPrivilegeLevelOf,
  raisesAccess,
  type SharingAccessLevel,
} from "../../../../overleaf/web/projects/sharing/sharingAccessLevels.js";
import type { PersonConfirmation } from "../../../personConfirmation/personConfirmation.js";
import { describeAccessLevel } from "../../../reading/accessLevelNames.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../../toolContext.js";
import { requireOverleafWebClient } from "../../requireOverleafWebClient.js";
import { describeMember, findSharedPerson } from "./findSharedPerson.js";
import { notAMemberMessage } from "./notAMemberMessage.js";
import { requireOwnedProject } from "./requireOwnedProject.js";
import { moreAccessQuestion } from "./sharingConfirmationQuestions.js";
import { requireSharingEmailAddress } from "./sharingEmailAddress.js";

export async function setMemberAccessAction(
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
  if (!member) {
    if (invites.length > 0) {
      throw new Error(
        `${address} has not accepted the invitation to ${target.label} yet, so there is no access level to change. Withdraw it with revoke_invite and invite again with the new level. Nothing changed.`,
      );
    }
    throw new Error(notAMemberMessage(address, target.label));
  }
  const before = describeAccessLevel(member.accessLevel);
  if (member.accessLevel === privilegeLevel) {
    return textResult(
      `${describeMember(member)}'s access to ${target.label} is already "${before}"; nothing changed.`,
    );
  }
  if (raisesAccess(member.accessLevel, privilegeLevel)) {
    const notYetConfirmed = confirmation.replyUntilConfirmed(
      moreAccessQuestion(target, address, member, privilegeLevel),
    );
    if (notYetConfirmed) return notYetConfirmed;
  }
  await setMemberAccessLevel(webClient, target.projectId, member.userId, privilegeLevel);
  return textResult(
    `Changed ${describeMember(member)}'s access to ${target.label} from "${before}" to "${describeAccessLevel(privilegeLevel)}". Overleaf applies it at once.`,
  );
}
