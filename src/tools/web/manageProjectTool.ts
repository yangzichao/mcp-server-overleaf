import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { PROJECT_ARGUMENT_DESCRIPTION } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { createProjectAction } from "./projectActions/createProjectAction.js";
import { downloadProjectZipAction } from "./projectActions/downloadProjectZipAction.js";

const PROJECT_ACTIONS = ["create", "download_zip"] as const;

const manageProjectInput = z.object({
  action: z
    .enum(PROJECT_ACTIONS)
    .describe(
      "What to do: create (a new project in the account) or download_zip (save a project's source as a ZIP).",
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional()
    .describe(
      "create, required: name of the new project, as it will appear in the dashboard, up to 150 characters.",
    ),
  template: z
    .enum(["blank", "example"])
    .optional()
    .describe(
      'create only: "blank" for a minimal document, "example" for Overleaf\'s example paper (default "blank").',
    ),
  project: z.string().optional().describe(`download_zip only. ${PROJECT_ARGUMENT_DESCRIPTION}`),
  saveTo: z
    .string()
    .optional()
    .describe(
      "download_zip, required: absolute path to save the archive to, ending in .zip, in a directory that exists. Replaces an existing ZIP there, never any other file.",
    ),
});

type ManageProjectInput = z.infer<typeof manageProjectInput>;

export function registerManageProjectTool(server: McpServer, context: ToolContext): void {
  const actions: Record<(typeof PROJECT_ACTIONS)[number], ToolOperation<ManageProjectInput>> = {
    create: {
      uses: ["name", "template"],
      run: (input) =>
        createProjectAction(
          context,
          requireArgument(input.name, "name", "create"),
          input.template ?? "blank",
        ),
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
      title: "Create a project or download one",
      description:
        "Create a project in the signed-in Overleaf account, or download one as a ZIP; action picks what. " +
        "create makes a new project, blank (a minimal main.tex) or from Overleaf's example paper; it appears in the account's dashboard straight away, and the reply gives its address, which other tools take as `project`, for example to write files into it. " +
        "download_zip saves the whole project as Overleaf holds it now, binary files included, as the editor's Download Source menu does, for archiving or for a submission system such as arXiv; local edits are in it only after push_changes. " +
        "Nothing that already exists in Overleaf is changed. " +
        "A save path that is not absolute, does not end in .zip, or names a missing directory or an existing file that is not a ZIP is refused, and nothing is written. " +
        "Returns the new project's address, or the saved path and size.",
      inputSchema: manageProjectInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) => runToolSafely(context, () => runSelectedOperation(input.action, actions, input, ["action"])),
  );
}
