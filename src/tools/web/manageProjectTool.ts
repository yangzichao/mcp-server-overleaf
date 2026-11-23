import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { OVERLEAF_COMPILERS } from "../../overleaf/web/projects/projectSettings.js";
import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { PROJECT_ARGUMENT_DESCRIPTION } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { MANAGE_PROJECT_DESCRIPTION } from "./manageProjectDescription.js";
import { copyProjectAction } from "./projectActions/copyProjectAction.js";
import { createProjectAction } from "./projectActions/createProjectAction.js";
import { createProjectFromZipAction } from "./projectActions/createProjectFromZipAction.js";
import { downloadProjectZipAction } from "./projectActions/downloadProjectZipAction.js";
import {
  moveProjectBetweenListsAction,
  PROJECT_LIST_MOVES,
  type ProjectListMove,
} from "./projectActions/moveProjectBetweenListsAction.js";
import { renameProjectAction } from "./projectActions/renameProjectAction.js";
import { tagProjectAction, untagProjectAction } from "./projectActions/tagProjectActions.js";
import { updateSettingsAction } from "./projectActions/updateSettingsAction.js";
import { readSpellCheckLanguage } from "./projectSettings/requestedProjectSettings.js";

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
] as const;

const manageProjectInput = z.object({
  action: z
    .enum(PROJECT_ACTIONS)
    .describe(
      "What to do: create (a new project), create_from_zip (a new project from a ZIP file), copy (a copy of project), rename (project, owner only), archive, unarchive, trash or untrash (move project between this account's lists), tag or untag (add project to one of this account's tags or take it out), update_settings (compiler, main document, spell check, TeX Live version, track changes) or download_zip (save project's source as a ZIP).",
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
});

type ManageProjectInput = z.infer<typeof manageProjectInput>;
type ProjectActionName = (typeof PROJECT_ACTIONS)[number];

export function registerManageProjectTool(server: McpServer, context: ToolContext): void {
  const listMove = (move: ProjectListMove): ToolOperation<ManageProjectInput> => ({
    uses: ["project"],
    run: (input) => moveProjectBetweenListsAction(context, move, input.project),
  });

  const actions: Record<ProjectActionName, ToolOperation<ManageProjectInput>> = {
    create: {
      uses: ["name", "template"],
      run: (input) =>
        createProjectAction(
          context,
          requireArgument(input.name, "name", "create"),
          input.template ?? "blank",
        ),
    },
    create_from_zip: {
      uses: ["sourcePath", "name"],
      run: (input) =>
        createProjectFromZipAction(
          context,
          requireArgument(input.sourcePath, "sourcePath", "create_from_zip"),
          input.name,
        ),
    },
    copy: {
      uses: ["project", "name"],
      run: (input) => copyProjectAction(context, input.project, requireArgument(input.name, "name", "copy")),
    },
    rename: {
      uses: ["project", "name"],
      run: (input) =>
        renameProjectAction(context, input.project, requireArgument(input.name, "name", "rename")),
    },
    archive: listMove("archive"),
    unarchive: listMove("unarchive"),
    trash: listMove("trash"),
    untrash: listMove("untrash"),
    tag: {
      uses: ["project", "tag"],
      run: (input) => tagProjectAction(context, input.project, requireArgument(input.tag, "tag", "tag")),
    },
    untag: {
      uses: ["project", "tag"],
      run: (input) => untagProjectAction(context, input.project, requireArgument(input.tag, "tag", "untag")),
    },
    update_settings: {
      uses: ["project", "compiler", "rootDocument", "spellCheckLanguage", "texLiveImage", "trackChanges"],
      run: (input) =>
        updateSettingsAction(context, input.project, {
          compiler: input.compiler,
          rootDocument: input.rootDocument,
          spellCheckLanguage: readSpellCheckLanguage(input.spellCheckLanguage),
          texLiveImage: input.texLiveImage,
          trackChanges: input.trackChanges,
        }),
    },
    download_zip: {
      uses: ["project", "saveTo"],
      run: (input) =>
        downloadProjectZipAction(
          context,
          input.project,
          requireArgument(input.saveTo, "saveTo", "download_zip"),
        ),
    },
  };

  server.registerTool(
    "manage_project",
    {
      title: "Manage Overleaf projects",
      description: MANAGE_PROJECT_DESCRIPTION,
      inputSchema: manageProjectInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) => runToolSafely(context, () => runSelectedOperation(input.action, actions, input, ["action"])),
  );
}
