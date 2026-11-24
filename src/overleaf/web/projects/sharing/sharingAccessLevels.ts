export const SHARING_ACCESS_LEVELS = ["edit", "review", "view"] as const;

export type SharingAccessLevel = (typeof SHARING_ACCESS_LEVELS)[number];

const OVERLEAF_PRIVILEGE_LEVELS: Readonly<Record<SharingAccessLevel, string>> = {
  edit: "readAndWrite",
  review: "review",
  view: "readOnly",
};

export function overleafPrivilegeLevelOf(accessLevel: SharingAccessLevel): string {
  return OVERLEAF_PRIVILEGE_LEVELS[accessLevel];
}

const PRIVILEGE_RANKS: Readonly<Record<string, number>> = {
  readOnly: 0,
  review: 1,
  readWrite: 2,
  readAndWrite: 2,
};

export function raisesAccess(currentPrivilegeLevel: string, newPrivilegeLevel: string): boolean {
  return (PRIVILEGE_RANKS[currentPrivilegeLevel] ?? -1) < (PRIVILEGE_RANKS[newPrivilegeLevel] ?? -1);
}
