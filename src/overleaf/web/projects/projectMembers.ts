import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { OverleafWebRequestError } from "../overleafWebErrors.js";

/**
 * Who a project is shared with, read-only. `GET /project/:id/members`
 * (`CollaboratorsController.getAllMembers`) lists invited members as
 * `ProjectEditorHandler.buildUserModelView` describes them, leaving out the owner and anyone who
 * joined through a sharing link. `GET /project/:id/invites`
 * (`CollaboratorsInviteController.getAllInvites`) lists invitations not yet accepted, and only to
 * the owner. Inviting, removing and transferring are deliberately not offered: an invitation
 * gives someone outside the project access to it.
 */

export interface ProjectMember {
  readonly userId: string;
  readonly email: string;
  /** First and last name, or the email address when Overleaf has no name. */
  readonly name: string;
  /** "readAndWrite", "review" or "readOnly", Overleaf's `PrivilegeLevels`. */
  readonly accessLevel: string;
  /** A read-only member waiting for an editor or reviewer seat on the owner's plan. */
  readonly pendingEditor: boolean;
  readonly pendingReviewer: boolean;
}

export interface PendingProjectInvite {
  readonly inviteId: string;
  readonly email: string;
  readonly accessLevel: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readMember(entry: unknown): ProjectMember | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const member = entry as Record<string, unknown>;
  const userId = readString(member._id);
  if (!userId) return undefined;
  const email = readString(member.email) ?? "";
  const name = [readString(member.first_name), readString(member.last_name)].filter(Boolean).join(" ");
  return {
    userId,
    email,
    name: name || email || `user ${userId}`,
    accessLevel: readString(member.privileges) ?? "unknown",
    pendingEditor: member.pendingEditor === true,
    pendingReviewer: member.pendingReviewer === true,
  };
}

function readInvite(entry: unknown): PendingProjectInvite | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const invite = entry as Record<string, unknown>;
  const inviteId = readString(invite._id);
  const email = readString(invite.email);
  if (!inviteId || !email) return undefined;
  return { inviteId, email, accessLevel: readString(invite.privileges) ?? "unknown" };
}

function readList<T>(payload: unknown, key: string, read: (entry: unknown) => T | undefined): T[] {
  const entries =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : undefined;
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => read(entry) ?? []);
}

export async function fetchProjectMembers(
  client: OverleafWebClient,
  projectId: string,
): Promise<ProjectMember[]> {
  const id = requireOverleafId(projectId, "Project id");
  try {
    return readList(await client.getJson(`/project/${id}/members`), "members", readMember);
  } catch (error) {
    if (error instanceof OverleafWebRequestError && error.status === 403) {
      throw new OverleafWebRequestError(
        "Overleaf did not list this project's members: this account cannot open the project, or reached it only through a read-only sharing link.",
        403,
      );
    }
    throw error;
  }
}

export async function fetchPendingInvites(
  client: OverleafWebClient,
  projectId: string,
): Promise<PendingProjectInvite[]> {
  const id = requireOverleafId(projectId, "Project id");
  try {
    return readList(await client.getJson(`/project/${id}/invites`), "invites", readInvite);
  } catch (error) {
    if (error instanceof OverleafWebRequestError && error.status === 403) {
      throw new OverleafWebRequestError(
        "Overleaf shows a project's pending invitations only to its owner, and this account is not the owner.",
        403,
      );
    }
    throw error;
  }
}
