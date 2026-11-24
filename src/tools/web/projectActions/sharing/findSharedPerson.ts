import type { OverleafWebClient } from "../../../../overleaf/web/overleafWebClient.js";
import {
  fetchPendingInvites,
  fetchProjectMembers,
  type PendingProjectInvite,
  type ProjectMember,
} from "../../../../overleaf/web/projects/sharing/projectMembers.js";
import { isSameEmailAddress } from "./sharingEmailAddress.js";

export interface SharedPerson {
  readonly member: ProjectMember | undefined;
  readonly invites: readonly PendingProjectInvite[];
}

export async function findSharedPerson(
  webClient: OverleafWebClient,
  projectId: string,
  email: string,
): Promise<SharedPerson> {
  const [members, invites] = await Promise.all([
    fetchProjectMembers(webClient, projectId),
    fetchPendingInvites(webClient, projectId),
  ]);
  return {
    member: members.find((member) => isSameEmailAddress(member.email, email)),
    invites: invites.filter((invite) => isSameEmailAddress(invite.email, email)),
  };
}

export function describeMember(member: ProjectMember): string {
  return member.email && member.email !== member.name ? `${member.name} <${member.email}>` : member.name;
}
