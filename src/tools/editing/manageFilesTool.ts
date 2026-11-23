import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { createFolderAction } from "../fileTree/createFolderAction.js";
import { revisionArgument } from "../history/revisionArgument.js";
import type { OfferedToolGroups } from "../offeredToolGroups.js";
import { projectArgument } from "../projectArgument.js";
import { EDITS_LOCAL_CLONE } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { deleteFileAction } from "./fileActions/deleteFileAction.js";
import { discardLocalChangesAction } from "./fileActions/discardLocalChangesAction.js";
import { moveFileAction } from "./fileActions/moveFileAction.js";
import { restoreFileAction } from "./fileActions/restoreFileAction.js";
import { readUploadBytes, uploadFileAction } from "./fileActions/uploadFileAction.js";
import {
  describeManageFiles,
  describeManageFilesAction,
  describeManageFilesPath,
  FOLDER_IN_CLONE_NEXT_STEP,
} from "./manageFilesDescriptions.js";

const FILE_ACTIONS = ["delete", "move", "upload", "restore", "discard_local_changes"] as const;
const FILE_AND_FOLDER_ACTIONS = [...FILE_ACTIONS, "create_folder"] as const;
const TITLE = "Delete, move, upload or restore files and folders";

const fileAndFolderInput = z.object({
  project: projectArgument,
  action: z.enum(FILE_AND_FOLDER_ACTIONS).describe(describeManageFilesAction(true)),
  path: z.string().optional().describe(describeManageFilesPath(true)),
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

/** The same arguments on a server with no session cookie, where create_folder cannot reach Overleaf. */
const fileInput = fileAndFolderInput.extend({
  action: z.enum(FILE_ACTIONS).describe(describeManageFilesAction(false)),
  path: z.string().optional().describe(describeManageFilesPath(false)),
});

type ManageFilesInput = z.infer<typeof fileAndFolderInput>;

function buildFileActions(
  context: ToolContext,
): Record<(typeof FILE_ACTIONS)[number], ToolOperation<ManageFilesInput>> {
  /** Every action but discarding pulls first, so it never works on a stale copy of the project. */
  const changeSynchronizedClone = (
    project: string | undefined,
    change: (repository: OverleafGitRepository) => Promise<string>,
  ) =>
    context.projectRegistry.withRepository(project, async (repository) => {
      await requireSynchronizedWithOverleaf(repository);
      return textResult(await change(repository));
    });

  return {
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
}

export function registerManageFilesTool(
  server: McpServer,
  context: ToolContext,
  offered: OfferedToolGroups,
): void {
  const fileActions = buildFileActions(context);
  if (!offered.sessionCookieToolsOffered) {
    server.registerTool(
      "manage_files",
      {
        title: TITLE,
        description: describeManageFiles(false),
        inputSchema: fileInput,
        annotations: EDITS_LOCAL_CLONE,
      },
      (input) =>
        runToolSafely(context, () =>
          runSelectedOperation(input.action, fileActions, input, ["project", "action"]),
        ),
    );
    return;
  }

  const fileAndFolderActions: Record<
    (typeof FILE_AND_FOLDER_ACTIONS)[number],
    ToolOperation<ManageFilesInput>
  > = {
    ...fileActions,
    create_folder: {
      uses: ["path"],
      run: (input) =>
        createFolderAction(context, {
          project: input.project,
          path: requireArgument(input.path, "path", "create_folder"),
          nextStep: FOLDER_IN_CLONE_NEXT_STEP,
        }),
    },
  };
  server.registerTool(
    "manage_files",
    {
      title: TITLE,
      description: describeManageFiles(true),
      inputSchema: fileAndFolderInput,
      annotations: EDITS_LOCAL_CLONE,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, fileAndFolderActions, input, ["project", "action"]),
      ),
  );
}
