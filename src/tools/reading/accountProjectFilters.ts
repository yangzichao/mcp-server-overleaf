import type { AccountProject, AccountProjectListOptions } from "../../overleaf/web/accountProjects.js";

/**
 * The lists of Overleaf's project dashboard. all leaves out archived and trashed projects, as the
 * dashboard's "All projects" does; archive and trash belong to the signed-in account, so a
 * co-author's archive does not move a project here.
 */

export const ACCOUNT_PROJECT_FILTERS = ["all", "owned", "shared", "archived", "trashed"] as const;
export type AccountProjectFilter = (typeof ACCOUNT_PROJECT_FILTERS)[number];

interface AccountProjectFilterRule {
  /** Which of the account's projects Overleaf has to send for this list. */
  readonly listOptions: AccountProjectListOptions;
  readonly keeps: (project: AccountProject) => boolean;
  /** Completes "3 projects ..." and "No project ...". */
  readonly where: string;
}

export const ACCOUNT_PROJECT_FILTER_RULES: Readonly<Record<AccountProjectFilter, AccountProjectFilterRule>> =
  {
    all: { listOptions: {}, keeps: () => true, where: "in the account" },
    owned: {
      listOptions: {},
      keeps: (project) => project.accessLevel === "owner",
      where: "owned by this account",
    },
    shared: {
      listOptions: {},
      keeps: (project) => project.accessLevel !== "owner",
      where: "shared with this account",
    },
    archived: {
      listOptions: { includeArchived: true },
      keeps: (project) => project.archived,
      where: "archived in this account",
    },
    trashed: {
      listOptions: { includeTrashed: true },
      keeps: (project) => project.trashed,
      where: "in this account's trash",
    },
  };
