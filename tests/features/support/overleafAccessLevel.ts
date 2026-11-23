import type { FakePermissionsLevel } from "../../integration/fakeOverleafRealtime.js";

const ACCESS_LEVELS: readonly FakePermissionsLevel[] = ["owner", "readAndWrite", "review", "readOnly"];

/** The access levels Overleaf's editor reports, spelt as it spells them. */
export function parseAccessLevel(text: string): FakePermissionsLevel {
  const level = ACCESS_LEVELS.find((candidate) => candidate === text);
  if (!level) throw new Error(`Unknown access level "${text}". Known: ${ACCESS_LEVELS.join(", ")}.`);
  return level;
}
