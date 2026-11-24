import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  everyKnownUserId,
  type OverleafProjectDetails,
  readProjectDetails,
} from "../../../../src/overleaf/realtime/overleafProjectDetails.js";

const userId = fc.stringMatching(/^[0-9a-f]{24}$/);
const nonEmpty = fc.string({ unit: "grapheme", minLength: 1, maxLength: 8 });

const user = fc.record(
  {
    _id: userId,
    first_name: fc.oneof(nonEmpty, fc.constant("")),
    last_name: fc.oneof(nonEmpty, fc.constant("")),
    email: nonEmpty,
  },
  { requiredKeys: ["_id"] },
);
const trackChangesState = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.dictionary(
    fc.oneof(userId, fc.constant("__guests__")),
    fc.oneof(fc.boolean(), fc.jsonValue({ maxDepth: 0 })),
  ),
);
const projectPayload = fc.record(
  {
    owner: user,
    members: fc.array(user, { maxLength: 3 }),
    features: fc.record({ trackChanges: fc.boolean() }),
    trackChangesState,
    compiler: fc.constantFrom("pdflatex", "xelatex", "lualatex", ""),
    imageName: fc.constantFrom("texlive-full:2025.1", ""),
    spellCheckLanguage: fc.constantFrom("en", "de", ""),
  },
  { requiredKeys: [] },
);
type ProjectPayload = typeof projectPayload extends fc.Arbitrary<infer Payload> ? Payload : never;

function present(text: string | undefined): string | undefined {
  return text === undefined || text === "" ? undefined : text;
}

function expectedDetails(payload: ProjectPayload): OverleafProjectDetails {
  const state = payload.trackChangesState;
  const entries = state && typeof state === "object" ? Object.entries(state) : [];
  const users = entries.filter(([key]) => key !== "__guests__");
  const ownerName = [payload.owner?.first_name, payload.owner?.last_name].filter((part) => part).join(" ");
  return {
    ownerId: payload.owner?._id,
    ownerName: present(ownerName),
    ownerEmail: present(payload.owner?.email),
    memberIds: (payload.members ?? []).map((member) => member._id),
    trackChangesAvailable: payload.features?.trackChanges === true,
    trackChanges:
      state === true
        ? { onForEveryone: true, onForUserIds: [], namedUserIds: [], onForGuests: true }
        : {
            onForEveryone: false,
            onForUserIds: users.filter(([, on]) => on === true).map(([id]) => id),
            namedUserIds: users.map(([id]) => id),
            onForGuests: entries.some(([key, on]) => key === "__guests__" && on === true),
          },
    compiler: present(payload.compiler),
    texLiveImage: present(payload.imageName),
    spellCheckLanguage: present(payload.spellCheckLanguage),
  };
}

describe("readProjectDetails properties", () => {
  it("reads the owner, members, track changes state and compile settings Overleaf describes", () => {
    fc.assert(
      fc.property(projectPayload, (payload) => {
        expect(readProjectDetails(JSON.parse(JSON.stringify(payload)))).toEqual(expectedDetails(payload));
      }),
    );
  });

  it("never throws, and gives only non-empty strings, whatever the payload holds", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.jsonValue({ maxDepth: 3 }),
          fc.record(
            {
              owner: fc.jsonValue({ maxDepth: 2 }),
              members: fc.jsonValue({ maxDepth: 2 }),
              features: fc.jsonValue({ maxDepth: 1 }),
              trackChangesState: fc.jsonValue({ maxDepth: 1 }),
              compiler: fc.jsonValue({ maxDepth: 0 }),
            },
            { requiredKeys: [] },
          ),
        ),
        (payload) => {
          const details = readProjectDetails(payload);
          for (const value of [
            details.ownerId,
            details.ownerName,
            details.ownerEmail,
            details.compiler,
            ...details.memberIds,
          ]) {
            if (value !== undefined) expect(typeof value === "string" && value !== "").toBe(true);
          }
        },
      ),
    );
  });
});

describe("everyKnownUserId properties", () => {
  it("names the owner, every member and every user the state names, each once", () => {
    fc.assert(
      fc.property(projectPayload, (payload) => {
        const details = readProjectDetails(JSON.parse(JSON.stringify(payload)));
        const known = everyKnownUserId(details);
        expect(new Set(known).size).toBe(known.length);
        expect(new Set(known)).toEqual(
          new Set([
            ...(details.ownerId ? [details.ownerId] : []),
            ...details.memberIds,
            ...details.trackChanges.namedUserIds,
          ]),
        );
        expect(known).not.toContain("__guests__");
      }),
    );
  });
});
