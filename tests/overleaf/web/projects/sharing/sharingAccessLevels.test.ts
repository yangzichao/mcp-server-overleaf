import { describe, expect, it } from "vitest";

import {
  overleafPrivilegeLevelOf,
  raisesAccess,
} from "../../../../../src/overleaf/web/projects/sharing/sharingAccessLevels.js";

describe("which access changes give a member more", () => {
  it.each([
    ["readOnly", "review", true],
    ["readOnly", "readAndWrite", true],
    ["review", "readAndWrite", true],
    ["readAndWrite", "review", false],
    ["readAndWrite", "readOnly", false],
    ["review", "readOnly", false],
    ["readOnly", "readOnly", false],
    ["readWrite", "readAndWrite", false],
    ["readWrite", "review", false],
    ["unknown", "readOnly", true],
    ["pendingEditor", "review", true],
  ])("%s to %s raises access: %s", (current, next, expected) => {
    expect(raisesAccess(current, next)).toBe(expected);
  });

  it("names Overleaf's privilege level for each access a call can ask for", () => {
    expect([
      overleafPrivilegeLevelOf("view"),
      overleafPrivilegeLevelOf("review"),
      overleafPrivilegeLevelOf("edit"),
    ]).toEqual(["readOnly", "review", "readAndWrite"]);
  });
});
