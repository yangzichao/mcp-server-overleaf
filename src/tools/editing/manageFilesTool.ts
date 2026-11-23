import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { revisionArgument } from "../history/revisionArgument.js";
import { projectArgument } from "../projectArgument.js";
import { EDITS_LOCAL_CLONE } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { deleteFileAction } from "./fileActions/deleteFileAction.js";
import { discardLocalChangesAction } from "./fileActions/discardLocalChangesAction.js";
import { moveFileAction } from "./fileActions/moveFileAction.js";
import { restoreFileAction } from "./fileActions/restoreFileAction.js";
import { readUploadBytes, uploadFileAction } from "./fileActions/uploadFileAction.js";

const FILE_ACTIONS = ["delete", "move", "upload", "restore", "discard_local_changes"] as const;

const manageFilesInput = z.object({
  project: projectArgument,
  action: z
    .enum(FILE_ACTIONS)
    .describe(
      "What to do: delete, move, upload, restore (a file from an earlier revision) or discard_local_changes (every local change in the project, permanently).",
    ),
  path: z
    .string()
    .optional()
    .describe(
      "delete, move, upload and restore, required: the file, relative to the project root, as read_project (view files) prints it, e.g. sections/intro.tex. For move it is the current path; for upload, where the file goes.",
    ),
  toPath: z
    .string()
    .optional()
    .describe(
      "move, required: the new path, relative to the project root, e.g. sections/intro.tex. Must stay inside the project and must not already exist.",
    ),
  sourcePath: z
    .string()
    .optional()
    .describe(
      "upload: absolute path of the file on this computer to copy, e.g. /Users/me/results/plot.png. Give this or contentBase64.",
    ),
  contentBase64: z
    .string()
    .optional()
    .describe(
      "upload: the file's content, base64-encoded, for content that is not on disk. Give this or sourcePath.",
    ),
  revision: revisionArgument
    .optional()
    .describe("restore, required: the commit hash to restore the file from, as read_history prints it."),
});

type ManageFilesInput = z.infer<typeof manageFilesInput>;

export function registerManageFilesTool(server: McpServer, context: ToolContext): void {
  /** Every action but discarding pulls first, so it never works on a stale copy of the project. */
  const changeSynchronizedClone = (
    project: string | undefined,
    change: (repository: OverleafGitRepository) => Promise<string>,
  ) =>
    context.projectRegistry.withRepository(project, async (repository) => {
      await requireSynchronizedWithOverleaf(repository);
      return textResult(await change(repository));
    });

  const actions: Record<(typeof FILE_ACTIONS)[number], ToolOperation<ManageFilesInput>> = {
    delete: {
      uses: ["path"],
      run: (input) => {
        const path = requireArgument(input.path, "path", "delete");
        return changeSynchronizedClone(input.project, (repository) => deleteFileAction(repository, path));
      },
    },
    move: {
      uses: ["path", "toPath"],
      run: (input) => {
        const path = requireArgument(input.path, "path", "move");
        const toPath = requireArgument(input.toPath, "toPath", "move");
        return changeSynchronizedClone(input.project, (repository) =>
          moveFileAction(repository, path, toPath),
        );
      },
    },
    upload: {
      uses: ["path", "sourcePath", "contentBase64"],
      run: async (input) => {
        const path = requireArgument(input.path, "path", "upload");
        const bytes = await readUploadBytes(input.sourcePath, input.contentBase64);
        return await changeSynchronizedClone(input.project, (repository) =>
          uploadFileAction(repository, path, bytes),
        );
      },
    },
    restore: {
      uses: ["path", "revision"],
      run: (input) => {
        const path = requireArgument(input.path, "path", "restore");
        const revision = requireArgument(input.revision, "revision", "restore");
        return changeSynchronizedClone(input.project, (repository) =>
          restoreFileAction(repository, path, revision),
        );
      },
    },
    discard_local_changes: {
      uses: [],
      run: (input) =>
        context.projectRegistry.withRepository(input.project, async (repository) =>
          textResult(await discardLocalChangesAction(repository)),
        ),
    },
  };

  server.registerTool(
    "manage_files",
    {
      title: "Delete, move, upload or restore files",
      description:
        "Change which files the project's local clone holds, or throw local work away; action picks what. " +
        "delete removes a file. move renames it or moves it inside the project, creating missing parent directories and refusing a toPath that already exists. " +
        "upload adds a file byte for byte, such as a figure, a PDF, a data file or a .bib from elsewhere, copied from sourcePath on this computer or decoded from contentBase64, and replaces a file already at path; edit_file is for text written in the call itself. " +
        "restore puts a file back to exactly what it was at revision, binary files included, and brings back a file deleted since; find the revision with read_history. " +
        "discard_local_changes permanently throws away every local edit, new file and unpushed commit in the project, fetching Overleaf first so the clone ends up matching its current version; call it only once the user has said the work should be abandoned, typically after push_changes refuses a conflicting change. " +
        "Nothing reaches Overleaf until push_changes, and until then discard_local_changes undoes any of these; review them with read_project (view changes). " +
        "Directories are refused, and LaTeX references are not rewritten: after a move or delete, search_project for the old path and fix what still names it with edit_file. " +
        "Uploads over 50 MB and files under a hidden directory such as ~/.ssh are refused, and an upload turns off text-only checkout for the project so the new file is committed with the rest. " +
        "Every action except discard_local_changes pulls from Overleaf first, and fails, keeping local work, if that pull conflicts with it. " +
        "Returns what was changed, or why nothing was.",
      inputSchema: manageFilesInput,
      annotations: EDITS_LOCAL_CLONE,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.action, actions, input, ["project", "action"])),
  );
}
