import type { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";
import {
  type FakeAnswer,
  FORBIDDEN,
  jsonAnswer,
  NO_CONTENT,
  NOT_FOUND,
  statusAnswer,
} from "../fakeWebAnswers.js";
import type { FakeProjectAccess } from "./fakeProjectAccess.js";
import { FAKE_CURRENT_USER_EMAIL, type FakeMember } from "./fakeProjectMembers.js";
import { type FakeWebRequest, type FakeWebRoutes, matchPath, readJsonBody } from "./fakeWebRequest.js";

const PRIVILEGE_LEVELS = new Set(["readOnly", "readAndWrite", "review"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Cloud Armor's block page, which Overleaf's servers did not write, so it has no `X-Served-By`. */
const BOT_PROTECTION_BLOCK: FakeAnswer = {
  status: 403,
  contentType: "text/html",
  body: "<!doctype html><title>403 Forbidden</title>",
  fromBotProtection: true,
};

/** What `parseReq` answers for a body its strict schema refuses. */
const INVALID_REQUEST = statusAnswer(400, { message: "invalid request" });

function hasOnlyKeys(body: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(body).every((key) => keys.includes(key));
}

/**
 * `CollaboratorsRouter.mjs`: the member list for anyone who can read the project, and the
 * invitations and every change to them for its owner.
 */
export class FakeCollaboratorRoutes implements FakeWebRoutes {
  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly access: FakeProjectAccess,
  ) {}

  route(request: FakeWebRequest): FakeAnswer | undefined {
    return (
      this.routeLists(request) ??
      this.routeInvite(request) ??
      this.routeMemberChange(request) ??
      this.routeRevoke(request)
    );
  }

  private routeLists(request: FakeWebRequest): FakeAnswer | undefined {
    const members = matchPath(request, "GET", /^\/project\/([0-9a-f]{24})\/members$/i);
    if (members?.[1]) {
      return this.access.canRead(members[1]) ? jsonAnswer({ members: this.currentMembers() }) : FORBIDDEN;
    }
    const invites = matchPath(request, "GET", /^\/project\/([0-9a-f]{24})\/invites$/i);
    if (invites?.[1]) {
      return this.access.isOwner(invites[1])
        ? jsonAnswer({ invites: this.realtime.sharing.invites })
        : FORBIDDEN;
    }
    return undefined;
  }

  private routeInvite(request: FakeWebRequest): FakeAnswer | undefined {
    const invite = matchPath(request, "POST", /^\/project\/([0-9a-f]{24})\/invite$/i);
    if (!invite?.[1]) return undefined;
    if (this.realtime.sharing.answerInvitesAsBotProtection) return BOT_PROTECTION_BLOCK;
    return this.access.isOwner(invite[1]) ? this.invite(request) : FORBIDDEN;
  }

  private routeMemberChange(request: FakeWebRequest): FakeAnswer | undefined {
    if (request.method !== "PUT" && request.method !== "DELETE") return undefined;
    const memberChange = /^\/project\/([0-9a-f]{24})\/users\/([0-9a-f]{24})$/i.exec(request.path);
    if (!memberChange?.[1] || !memberChange[2]) return undefined;
    if (!this.access.isOwner(memberChange[1])) return FORBIDDEN;
    return request.method === "PUT"
      ? this.setAccessLevel(request, memberChange[2])
      : this.removeMember(memberChange[2]);
  }

  private routeRevoke(request: FakeWebRequest): FakeAnswer | undefined {
    const revoke = matchPath(request, "DELETE", /^\/project\/([0-9a-f]{24})\/invite\/([0-9a-f]{24})$/i);
    if (!revoke?.[1] || !revoke[2]) return undefined;
    if (!this.access.isOwner(revoke[1])) return FORBIDDEN;
    this.realtime.sharing.removeInvite(revoke[2]);
    return NO_CONTENT;
  }

  private currentMembers(): FakeMember[] {
    return this.realtime.sharing.ownerAndMembers(this.realtime.userId, this.realtime.permissionsLevel)
      .members;
  }

  private invite(request: FakeWebRequest): FakeAnswer {
    const body = readJsonBody(request);
    const { email, privileges } = body;
    if (
      !hasOnlyKeys(body, ["email", "privileges"]) ||
      typeof email !== "string" ||
      typeof privileges !== "string" ||
      !PRIVILEGE_LEVELS.has(privileges)
    ) {
      return INVALID_REQUEST;
    }
    if (email === FAKE_CURRENT_USER_EMAIL) return jsonAnswer({ invite: null, error: "cannot_invite_self" });
    const sharing = this.realtime.sharing;
    if (privileges !== "readOnly" && !sharing.hasFreeSeat(this.currentMembers())) {
      return jsonAnswer({ invite: null });
    }
    const address = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(address)) return statusAnswer(400, { errorReason: "invalid_email" });
    if (sharing.existingAccountEmails && !sharing.existingAccountEmails.has(address)) {
      return jsonAnswer({ invite: null, error: "cannot_invite_non_user" });
    }
    return jsonAnswer({ invite: sharing.addInvite(address, privileges) });
  }

  private setAccessLevel(request: FakeWebRequest, userId: string): FakeAnswer {
    const body = readJsonBody(request);
    const { privilegeLevel } = body;
    if (
      !hasOnlyKeys(body, ["privilegeLevel"]) ||
      typeof privilegeLevel !== "string" ||
      !PRIVILEGE_LEVELS.has(privilegeLevel)
    ) {
      return INVALID_REQUEST;
    }
    const sharing = this.realtime.sharing;
    const members = this.currentMembers();
    const member = members.find((candidate) => candidate._id === userId);
    const needsNewSeat =
      sharing.takesSeat(privilegeLevel) && !(member && sharing.takesSeat(member.privileges));
    if (needsNewSeat && !sharing.hasFreeSeat(members)) {
      return statusAnswer(403, { message: "edit collaborator limit reached" });
    }
    if (!member) return NOT_FOUND;
    sharing.changedPrivileges.set(userId, privilegeLevel);
    return NO_CONTENT;
  }

  private removeMember(userId: string): FakeAnswer {
    if (this.currentMembers().some((member) => member._id === userId)) {
      this.realtime.sharing.removedMemberIds.add(userId);
    }
    return NO_CONTENT;
  }
}
