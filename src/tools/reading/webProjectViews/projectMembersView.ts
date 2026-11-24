import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import {
  fetchPendingInvites,
  fetchProjectMembers,
  type PendingProjectInvite,
  type ProjectMember,
} from "../../../overleaf/web/projects/sharing/projectMembers.js";
import { withReviewSession } from "../../review/openReviewSession.js";
import type { ToolContext } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { describeAccessLevel } from "../accessLevelNames.js";

/**
 * Who a project is shared with. The owner comes from the editor connection, which describes the
 * owner apart from the members; collaborators and invitations come from the web application,
 * and Overleaf answers the invitation list only to the owner, so for anyone else it is not asked.
 */

const NOT_LISTED_NOTE =
  "Anyone who joined through a sharing link is not listed; Overleaf's Share menu shows them. The owner can invite, change access, remove members and withdraw invitations with manage_project.";

function describePerson(name: string | undefined, email: string | undefined): string | undefined {
  if (name && email) return `${name} <${email}>`;
  return name ?? email;
}

function describeOwner(session: OverleafRealtimeSession): string {
  const isOwner = session.permissionsLevel === "owner";
  const owner = describePerson(session.details.ownerName, session.details.ownerEmail);
  if (owner) return `Owner: ${owner}${isOwner ? " (this account)" : ""}`;
  return isOwner ? "Owner: this account" : "Owner: Overleaf did not name the owner to this account.";
}

function describeMemberAccess(member: ProjectMember): string {
  const access = describeAccessLevel(member.accessLevel);
  if (member.pendingEditor) return `${access}, waiting for an editor seat on the owner's plan`;
  if (member.pendingReviewer) return `${access}, waiting for a reviewer seat on the owner's plan`;
  return access;
}

function describeCollaborators(members: readonly ProjectMember[]): string[] {
  if (members.length === 0) return ["Collaborators: nobody has been invited."];
  return [
    `Collaborators (${members.length}):`,
    ...members.map(
      (member) =>
        `- ${member.email && member.email !== member.name ? `${member.name} <${member.email}>` : member.name} — ${describeMemberAccess(member)}`,
    ),
  ];
}

function describeInvites(invites: readonly PendingProjectInvite[] | undefined): string[] {
  if (invites === undefined) {
    return [
      "Pending invitations: Overleaf shows them only to the project's owner, and this account is not the owner.",
    ];
  }
  if (invites.length === 0) return ["Pending invitations: none."];
  return [
    `Pending invitations (${invites.length}):`,
    ...invites.map((invite) => `- ${invite.email} — ${describeAccessLevel(invite.accessLevel)}`),
  ];
}

export function describeProjectMembers(context: ToolContext, project: string | undefined): Promise<string> {
  return withReviewSession(context, project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const projectId = session.project.projectId;
    const [members, invites] = await Promise.all([
      fetchProjectMembers(webClient, projectId),
      session.permissionsLevel === "owner" ? fetchPendingInvites(webClient, projectId) : undefined,
    ]);
    return [
      `Members of "${session.project.name}":`,
      describeOwner(session),
      ...describeCollaborators(members),
      ...describeInvites(invites),
      NOT_LISTED_NOTE,
    ].join("\n");
  });
}
