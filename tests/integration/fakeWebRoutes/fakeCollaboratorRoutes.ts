import type { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";
import { type FakeAnswer, FORBIDDEN, jsonAnswer } from "../fakeWebAnswers.js";
import type { FakeProjectAccess } from "./fakeProjectAccess.js";
import { FAKE_PENDING_INVITES, fakeOwnerAndMembers } from "./fakeProjectMembers.js";
import { type FakeWebRequest, type FakeWebRoutes, matchPath } from "./fakeWebRequest.js";

/** `GET /project/:id/members` for anyone who can read, `GET /project/:id/invites` for the owner. */
export class FakeCollaboratorRoutes implements FakeWebRoutes {
  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly access: FakeProjectAccess,
  ) {}

  route(request: FakeWebRequest): FakeAnswer | undefined {
    const members = matchPath(request, "GET", /^\/project\/([0-9a-f]{24})\/members$/i);
    if (members?.[1]) {
      if (!this.access.canRead(members[1])) return FORBIDDEN;
      return jsonAnswer({
        members: fakeOwnerAndMembers(this.realtime.userId, this.realtime.permissionsLevel).members,
      });
    }
    const invites = matchPath(request, "GET", /^\/project\/([0-9a-f]{24})\/invites$/i);
    if (invites?.[1]) {
      if (!this.access.isOwner(invites[1])) return FORBIDDEN;
      return jsonAnswer({ invites: FAKE_PENDING_INVITES });
    }
    return undefined;
  }
}
