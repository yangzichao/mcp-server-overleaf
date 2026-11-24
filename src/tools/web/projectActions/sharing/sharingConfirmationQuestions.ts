import type { ConfirmationQuestion } from "../../../personConfirmation/personConfirmation.js";
import { describeAccessLevel } from "../../../reading/accessLevelNames.js";
import type { TargetProject } from "../findTargetProject.js";

export function invitationQuestion(
  target: TargetProject,
  address: string,
  privilegeLevel: string,
): ConfirmationQuestion {
  return {
    key: `invite ${target.projectId} ${address} ${privilegeLevel}`,
    message: `Send an Overleaf invitation for ${target.label} to ${address}? Overleaf emails it at once, and once they accept it they ${describeAccessLevel(privilegeLevel)} the project. Confirm only if you asked for this invitation.`,
    confirmLabel: "Send the invitation",
    withoutConfirmation: `manage_project sends an invitation only after they confirm it. Nothing was sent; invite ${address} from the Share menu of ${target.label} in Overleaf instead.`,
    whenNotConfirmed: `The invitation to ${address} was not confirmed, so nothing was sent.`,
  };
}

export function moreAccessQuestion(
  target: TargetProject,
  address: string,
  member: { readonly userId: string; readonly accessLevel: string },
  privilegeLevel: string,
): ConfirmationQuestion {
  const before = describeAccessLevel(member.accessLevel);
  const after = describeAccessLevel(privilegeLevel);
  return {
    key: `set_access ${target.projectId} ${member.userId} ${privilegeLevel}`,
    message: `Change the access of ${address} to ${target.label} from "${before}" to "${after}"? Overleaf applies it at once. Confirm only if you asked for this change.`,
    confirmLabel: "Change the access",
    withoutConfirmation: `manage_project gives a member more access only after they confirm it. Nothing changed; change the access of ${address} from the Share menu of ${target.label} in Overleaf instead.`,
    whenNotConfirmed: `Giving ${address} access "${after}" was not confirmed, so nothing changed.`,
  };
}
