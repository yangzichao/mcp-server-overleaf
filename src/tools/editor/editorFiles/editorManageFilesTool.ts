import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../../actions/toolOperations.js";
import { readUploadBytes } from "../../editing/fileActions/uploadFileAction.js";
import { readFolderUploadDestination } from "../../editing/folderUpload/folderUploadTargets.js";
import { readLocalFolder } from "../../editing/folderUpload/readLocalFolder.js";
import { createFolderAction } from "../../fileTree/createFolderAction.js";
import { projectArgument } from "../../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "../editorFileArguments.js";
import { deleteEditorEntityAction } from "./deleteEditorEntityAction.js";
import { moveEditorEntityAction } from "./moveEditorEntityAction.js";
import { uploadEditorFileAction } from "./uploadEditorFileAction.js";
import { uploadEditorFolderAction } from "./uploadEditorFolderAction.js";

const EDITOR_FILE_ACTIONS = ["delete", "move", "upload", "upload_folder", "create_folder"] as const;

const editorManageFilesInput = z.object({
  project: projectArgument,
  action: z
    .enum(EDITOR_FILE_ACTIONS)
    .describe(
      "What to do: delete (a file, or a folder with everything in it), move (rename or move a file or folder), upload (a file from this computer or from base64), upload_folder (every file of a folder on this computer) or create_folder.",
    ),
  path: z
    .string()
    .describe(
      'Every action: a path relative to the project root, as read_project (view files) prints it, e.g. sections/intro.tex. For move it is the current path; for upload, where the file goes; for upload_folder, the folder to copy into, e.g. figures/plots, or "." for the project root; for create_folder, the folder to create, e.g. figures/plots.',
    ),
  toPath: z
    .string()
    .optional()
    .describe(
      "move, required: the new path, relative to the project root, e.g. chapters/intro.tex. Must not already exist; missing folders on the way are created.",
    ),
  sourcePath: z
    .string()
    .optional()
    .describe(
      "upload: absolute path of the file on this computer to copy, e.g. /Users/me/results/plot.png; give this or contentBase64. upload_folder, required: absolute path of the folder on this computer to copy, e.g. /Users/me/results/plots.",
    ),
  contentBase64: z
    .string()
    .optional()
    .describe(
      "upload: the file's content, base64-encoded, for content that is not on disk. Give this or sourcePath.",
    ),
});

type EditorManageFilesInput = z.infer<typeof editorManageFilesInput>;

const FOLDER_IN_EDITOR_NEXT_STEP =
  "Put files in it with edit_file (action write) or manage_files (action upload), naming paths under it.";

export function registerEditorManageFilesTool(server: McpServer, context: ToolContext): void {
  const actions: Record<(typeof EDITOR_FILE_ACTIONS)[number], ToolOperation<EditorManageFilesInput>> = {
    delete: {
      uses: [],
      run: (input) => deleteEditorEntityAction(context, input.project, input.path),
    },
    move: {
      uses: ["toPath"],
      run: (input) =>
        moveEditorEntityAction(
          context,
          input.project,
          input.path,
          requireArgument(input.toPath, "toPath", "move"),
        ),
    },
    upload: {
      uses: ["sourcePath", "contentBase64"],
      run: async (input) =>
        uploadEditorFileAction(
          context,
          input.project,
          input.path,
          await readUploadBytes(input.sourcePath, input.contentBase64),
        ),
    },
    upload_folder: {
      uses: ["sourcePath"],
      run: async (input) =>
        uploadEditorFolderAction(
          context,
          input.project,
          readFolderUploadDestination(input.path),
          await readLocalFolder(requireArgument(input.sourcePath, "sourcePath", "upload_folder")),
        ),
    },
    create_folder: {
      uses: [],
      run: (input) =>
        createFolderAction(context, {
          project: input.project,
          path: input.path,
          nextStep: FOLDER_IN_EDITOR_NEXT_STEP,
        }),
    },
  };

  server.registerTool(
    "manage_files",
    {
      title: "Delete, move, upload or create files and folders in Overleaf",
      description:
        "Change the project's files and folders in Overleaf's file tree; action picks what. " +
        "delete removes a document or an uploaded file, or a folder with everything in it. " +
        "move renames a file or folder, moves it into another folder, or both, creating missing folders on the way and refusing a toPath that already exists or lies inside the folder being moved. " +
        "upload adds a file byte for byte, such as a figure, a PDF or a .bib from elsewhere, copied from sourcePath on this computer or decoded from contentBase64; it creates missing folders, replaces whatever is at path, and Overleaf stores a text file such as a .tex or .bib as an editable document and anything else as a binary upload. Use edit_file for text written in the call itself. " +
        "upload_folder uploads every file under the folder sourcePath into the folder path, one after another, keeping its subfolders and replacing what is at those paths; hidden files and folders and symbolic links are left out, it takes at most 180 files, as Overleaf's upload dialog does, and if one fails the files before it stay in Overleaf and the reply lists them. " +
        "create_folder creates a folder and any missing parent folders. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Every action takes effect at once: co-authors see it immediately, with no push step and no undo here, so confirm deletes and moves with the user first. Every action needs edit access to the project. " +
        "LaTeX references are not rewritten: after a move or delete, search_project for the old path and fix what still names it with edit_file. " +
        "Uploads over 50 MB and files under a hidden directory such as ~/.ssh are refused. " +
        "Returns what was changed, or why nothing was.",
      inputSchema: editorManageFilesInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, actions, input, ["project", "action", "path"]),
      ),
  );
}
