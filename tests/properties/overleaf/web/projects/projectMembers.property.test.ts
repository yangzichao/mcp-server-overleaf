import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  OverleafWebRequestError,
  RequestNotSentError,
} from "../../../../../src/overleaf/web/overleafWebErrors.js";
import {
  fetchPendingInvites,
  fetchProjectMembers,
  type PendingProjectInvite,
  type ProjectMember,
} from "../../../../../src/overleaf/web/projects/projectMembers.js";
import { anyJsonField, awkwardText, notAnOverleafId, overleafId } from "./generatedOverleafAnswers.js";
import { recordingWebClient } from "./recordingWebClient.js";

const PROJECT_ID = "64b000000000000000000002";

const text = (...usual: string[]) =>
  fc.oneof({ weight: 2, arbitrary: fc.constantFrom(...usual) }, awkwardText, anyJsonField);

const describedMember = fc.record(
  {
    _id: fc.oneof({ weight: 3, arbitrary: overleafId }, { weight: 1, arbitrary: anyJsonField }),
    email: text("ada@example.com", ""),
    first_name: text("Ada", ""),
    last_name: text("Lovelace", ""),
    privileges: text("readAndWrite", "review", "readOnly"),
    pendingEditor: fc.oneof(fc.boolean(), anyJsonField),
    pendingReviewer: fc.oneof(fc.boolean(), anyJsonField),
  },
  { requiredKeys: [] },
);

const describedInvite = fc.record(
  {
    _id: fc.oneof({ weight: 3, arbitrary: overleafId }, { weight: 1, arbitrary: anyJsonField }),
    email: text("invited@example.com", ""),
    privileges: text("readAndWrite", "readOnly"),
  },
  { requiredKeys: [] },
);

function answerListing(key: string, entry: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> {
  const entries = fc.array(fc.oneof({ weight: 3, arbitrary: entry }, anyJsonField), { maxLength: 4 });
  return fc.oneof(
    { weight: 4, arbitrary: entries.map((listed) => ({ [key]: listed })) },
    {
      weight: 1,
      arbitrary: fc.oneof(
        anyJsonField,
        entries,
        anyJsonField.map((listed) => ({ [key]: listed })),
      ),
    },
  );
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function listedEntries(answer: unknown, key: string): Record<string, unknown>[] {
  const listed =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>)[key] : [];
  if (!Array.isArray(listed)) return [];
  return listed.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
}

function expectedMembers(answer: unknown): ProjectMember[] {
  return listedEntries(answer, "members").flatMap((member) => {
    const userId = nonEmptyText(member._id);
    if (userId === undefined) return [];
    const email = nonEmptyText(member.email) ?? "";
    const names = [nonEmptyText(member.first_name), nonEmptyText(member.last_name)].filter(
      (name) => name !== undefined,
    );
    const fallbackName = email === "" ? `user ${userId}` : email;
    return [
      {
        userId,
        email,
        name: names.length > 0 ? names.join(" ") : fallbackName,
        accessLevel: nonEmptyText(member.privileges) ?? "unknown",
        pendingEditor: member.pendingEditor === true,
        pendingReviewer: member.pendingReviewer === true,
      },
    ];
  });
}

function expectedInvites(answer: unknown): PendingProjectInvite[] {
  return listedEntries(answer, "invites").flatMap((invite) => {
    const inviteId = nonEmptyText(invite._id);
    const email = nonEmptyText(invite.email);
    if (inviteId === undefined || email === undefined) return [];
    return [{ inviteId, email, accessLevel: nonEmptyText(invite.privileges) ?? "unknown" }];
  });
}

const failure = fc.oneof(
  fc
    .constantFrom(400, 401, 403, 404, 500, undefined)
    .map((status) => new OverleafWebRequestError(`Overleaf answered ${status}.`, status, "A remedy.")),
  fc.constant(new RequestNotSentError("Not sent.")),
  fc.constant(new TypeError("fetch failed")),
);

describe("projectMembers properties", () => {
  it("lists each member with an id, named by first and last name, then email, then id", async () => {
    await fc.assert(
      fc.asyncProperty(answerListing("members", describedMember), async (answer) => {
        const { client, sent } = recordingWebClient(() => answer);
        expect(await fetchProjectMembers(client, PROJECT_ID)).toEqual(expectedMembers(answer));
        expect(sent.map((request) => request.path)).toEqual([`/project/${PROJECT_ID}/members`]);
      }),
    );
  });

  it("lists each pending invitation with an id and an email", async () => {
    await fc.assert(
      fc.asyncProperty(answerListing("invites", describedInvite), async (answer) => {
        const { client, sent } = recordingWebClient(() => answer);
        expect(await fetchPendingInvites(client, PROJECT_ID)).toEqual(expectedInvites(answer));
        expect(sent.map((request) => request.path)).toEqual([`/project/${PROJECT_ID}/invites`]);
      }),
    );
  });

  it("explains a 403 in its own words and passes any other failure on unchanged", async () => {
    const fetchers = [fetchProjectMembers, fetchPendingInvites];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...fetchers), failure, async (fetchListing, thrown) => {
        const { client } = recordingWebClient(() => {
          throw thrown;
        });
        const caught = await fetchListing(client, PROJECT_ID).then(
          () => undefined,
          (error: unknown) => error,
        );
        if (thrown instanceof OverleafWebRequestError && thrown.status === 403) {
          expect(caught).toBeInstanceOf(OverleafWebRequestError);
          expect(caught).not.toBe(thrown);
          expect((caught as OverleafWebRequestError).status).toBe(403);
        } else {
          expect(caught).toBe(thrown);
        }
      }),
    );
  });

  it("refuses a project id that is not an Overleaf id without sending anything", async () => {
    const fetchers = [fetchProjectMembers, fetchPendingInvites];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...fetchers), notAnOverleafId, async (fetchListing, projectId) => {
        const { client, sent } = recordingWebClient(() => ({ members: [], invites: [] }));
        await expect(fetchListing(client, projectId)).rejects.toBeInstanceOf(RequestNotSentError);
        expect(sent).toEqual([]);
      }),
    );
  });
});
