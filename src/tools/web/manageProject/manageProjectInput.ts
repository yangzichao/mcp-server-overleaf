import * as z from "zod/v4";

import { OVERLEAF_COMPILERS } from "../../../overleaf/web/projects/projectSettings.js";
import { SHARING_ACCESS_LEVELS } from "../../../overleaf/web/projects/sharing/sharingAccessLevels.js";
import { PROJECT_ARGUMENT_DESCRIPTION } from "../../projectArgument.js";
import { PROJECT_LIST_MOVES } from "../projectActions/moveProjectBetweenListsAction.js";

const PROJECT_ACTIONS = [
  "create",
  "create_from_zip",
  "copy",
  "rename",
  ...PROJECT_LIST_MOVES,
  "tag",
  "untag",
  "update_settings",
  "download_zip",
  "invite",
  "set_access",
  "remove_member",
  "revoke_invite",
] as const;

export const manageProjectInput = z.object({
  action: z
    .enum(PROJECT_ACTIONS)
    .describe(
      "What to do: create (a new project), create_from_zip (a new project from a ZIP file), copy (a copy of project), rename (project, owner only), archive, unarchive, trash or untrash (move project between this account's lists), tag or untag (add project to one of this account's tags or take it out), update_settings (compiler, main document, spell check, TeX Live version, track changes), download_zip (save project's source as a ZIP), or, owner only, invite (email someone an invitation to project), set_access (change a member's access level), remove_member (take a member's access away) or revoke_invite (withdraw a pending invitation).",
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional()
    .describe(
      "create, copy and rename, required: the new name as the dashboard will show it, up to 150 characters, without / or \\. create_from_zip: the new project's name, default the ZIP file's name without .zip.",
    ),
  template: z
    .enum(["blank", "example"])
    .optional()
    .describe(
      'create only: "blank" for a minimal document, "example" for Overleaf\'s example paper (default "blank").',
    ),
  sourcePath: z
    .string()
    .optional()
    .describe(
      "create_from_zip, required: absolute path of the ZIP archive on this computer, at most 50 MB, outside hidden directories.",
    ),
  project: z
    .string()
    .optional()
    .describe(`Every action except create and create_from_zip. ${PROJECT_ARGUMENT_DESCRIPTION}`),
  tag: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "tag and untag, required: the tag's name, up to 50 characters, matched ignoring case; tag creates it when the account has none by that name.",
    ),
  compiler: z
    .enum(OVERLEAF_COMPILERS)
    .optional()
    .describe("update_settings: the LaTeX engine Overleaf compiles the project with."),
  rootDocument: z
    .string()
    .optional()
    .describe(
      "update_settings: the document to make the main document, as a path from the project root such as main.tex; it must be a .tex, .Rtex, .ltx or .Rnw document.",
    ),
  spellCheckLanguage: z
    .string()
    .optional()
    .describe(
      'update_settings: a spell-check language code from Overleaf\'s list, such as en or en_GB, or "off" to turn spell checking off.',
    ),
  texLiveImage: z
    .string()
    .optional()
    .describe(
      "update_settings: the TeX Live version to compile with, as Overleaf names it, such as texlive-full:2025.1.",
    ),
  trackChanges: z
    .boolean()
    .optional()
    .describe(
      "update_settings: true turns track changes on for everyone in the project, link editors included, so what anyone types becomes a suggestion; false turns it off for everyone. Needs the owner's plan to include track changes.",
    ),
  saveTo: z
    .string()
    .optional()
    .describe(
      "download_zip, required: absolute path to save the archive to, ending in .zip, in a directory that exists. Replaces an existing ZIP there, never any other file.",
    ),
  email: z
    .string()
    .max(254)
    .optional()
    .describe(
      "invite, set_access, remove_member and revoke_invite, required: the person's email address alone, such as ada@example.com, matched ignoring case.",
    ),
  accessLevel: z
    .enum(SHARING_ACCESS_LEVELS)
    .optional()
    .describe(
      'invite and set_access, required: "edit", "review" (suggest changes and comment) or "view". Editors and reviewers take a seat on the owner\'s plan; viewers do not.',
    ),
});

export type ManageProjectInput = z.infer<typeof manageProjectInput>;
export type ProjectActionName = (typeof PROJECT_ACTIONS)[number];
