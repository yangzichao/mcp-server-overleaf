import { describe, expect, it } from "vitest";

import { everyKnownUserId } from "../../../../src/overleaf/realtime/overleafProjectDetails.js";
import { RequestNotSentError } from "../../../../src/overleaf/web/overleafWebErrors.js";
import { setTrackChangesForEveryone } from "../../../../src/overleaf/web/projects/trackChangesSwitch.js";
import {
  FAKE_COLLABORATOR_ID,
  FAKE_REVIEWER_ID,
} from "../../../integration/fakeWebRoutes/fakeProjectMembers.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";

describe("turning track changes on and off for everyone", () => {
  const connection = useFakeOverleafConnection();
  const switchFor = async (on: boolean): Promise<void> => {
    const { details } = await connection.joinProject();
    await setTrackChangesForEveryone(connection.client(), connection.overleaf.projectId, on, details);
  };

  it("names the owner, every member and guests, and the next connection sees it on for each", async () => {
    const everyone = [connection.overleaf.userId, FAKE_COLLABORATOR_ID, FAKE_REVIEWER_ID];
    expect(everyKnownUserId((await connection.joinProject()).details)).toEqual(everyone);
    await switchFor(true);
    const on = (await connection.joinProject()).details.trackChanges;
    expect(on).toEqual({
      onForEveryone: false,
      onForUserIds: everyone,
      namedUserIds: everyone,
      onForGuests: true,
    });
    await switchFor(false);
    const off = (await connection.joinProject()).details.trackChanges;
    expect(off).toEqual({
      onForEveryone: false,
      onForUserIds: [],
      namedUserIds: everyone,
      onForGuests: false,
    });
    expect(connection.changesSentTo(/track_changes$/)).toHaveLength(4);
  });

  it("refuses when the owner's plan has no track changes, before sending anything", async () => {
    connection.overleaf.hasTrackChangesFeature = false;
    const failure = await failureOf(switchFor(true));
    expect(failure).toBeInstanceOf(RequestNotSentError);
    expect(failure.message).toContain("plan");
    expect(connection.changesSentTo(/track_changes$/)).toEqual([]);
  });

  it("passes on Overleaf's refusal for a reviewer", async () => {
    connection.overleaf.permissionsLevel = "review";
    expect(statusOf(await failureOf(switchFor(true)))).toBe(403);
  });
});
