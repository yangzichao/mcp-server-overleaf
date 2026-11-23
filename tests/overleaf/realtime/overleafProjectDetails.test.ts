import { describe, expect, it } from "vitest";

import {
  everyKnownUserId,
  readProjectDetails,
} from "../../../src/overleaf/realtime/overleafProjectDetails.js";

describe("reading the project details the editor connection receives", () => {
  it("reads the owner, members, settings and a per-user track-changes map", () => {
    const details = readProjectDetails({
      owner: { _id: "u0", first_name: "Olga", last_name: "Example", email: "olga@example.com" },
      members: [{ _id: "u1" }, { _id: "u2" }, { first_name: "no id" }],
      compiler: "xelatex",
      imageName: "texlive-full:2025.1",
      spellCheckLanguage: "",
      features: { trackChanges: true },
      trackChangesState: { u1: true, u3: false, __guests__: true },
    });
    expect(details).toEqual({
      ownerId: "u0",
      ownerName: "Olga Example",
      ownerEmail: "olga@example.com",
      memberIds: ["u1", "u2"],
      trackChangesAvailable: true,
      trackChanges: {
        onForEveryone: false,
        onForUserIds: ["u1"],
        namedUserIds: ["u1", "u3"],
        onForGuests: true,
      },
      compiler: "xelatex",
      texLiveImage: "texlive-full:2025.1",
      spellCheckLanguage: undefined,
    });
    expect(everyKnownUserId(details)).toEqual(["u0", "u1", "u2", "u3"]);
  });

  it("reads a state of true as on for everyone, and false or none as off", () => {
    expect(readProjectDetails({ trackChangesState: true }).trackChanges).toEqual({
      onForEveryone: true,
      onForUserIds: [],
      namedUserIds: [],
      onForGuests: true,
    });
    const off = { onForEveryone: false, onForUserIds: [], namedUserIds: [], onForGuests: false };
    expect(readProjectDetails({ trackChangesState: false }).trackChanges).toEqual(off);
    expect(readProjectDetails(undefined).trackChanges).toEqual(off);
  });

  it("leaves the owner's name out when Overleaf sent only the id, as to a read-only link user", () => {
    const details = readProjectDetails({ owner: { _id: "u0" } });
    expect(details.ownerId).toBe("u0");
    expect(details.ownerName).toBeUndefined();
    expect(details.ownerEmail).toBeUndefined();
    expect(readProjectDetails({ owner: { _id: "u0", first_name: "Olga" } }).ownerName).toBe("Olga");
  });

  it("says track changes is unavailable when the owner's plan lacks it", () => {
    expect(readProjectDetails({ features: { trackChanges: false } }).trackChangesAvailable).toBe(false);
    expect(readProjectDetails({}).trackChangesAvailable).toBe(false);
    expect(everyKnownUserId(readProjectDetails({}))).toEqual([]);
  });
});
