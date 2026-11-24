/**
 * The words of manage_files on a server with a Git credential. With a session cookie as well,
 * create_folder joins the other actions, and it is the one that acts on Overleaf at once.
 */

export function describeManageFilesAction(withFolders: boolean): string {
  return withFolders
    ? "What to do: delete, move, upload, upload_folder (every file of a folder on this computer), restore (a file from an earlier revision), discard_local_changes (every local change in the project, permanently) or create_folder (a folder in Overleaf, at once)."
    : "What to do: delete, move, upload, upload_folder (every file of a folder on this computer), restore (a file from an earlier revision) or discard_local_changes (every local change in the project, permanently).";
}

export function describeManageFilesPath(withFolders: boolean): string {
  return (
    `${withFolders ? "delete, move, upload, upload_folder, restore and create_folder" : "delete, move, upload, upload_folder and restore"}, required: a path relative to the project root, as read_project (view files) prints it, e.g. sections/intro.tex. ` +
    'delete and move take a file or a directory, move at its current path; upload and restore take the file to write; upload_folder takes the directory to copy into, e.g. figures/plots, or "." for the project root.' +
    (withFolders ? " For create_folder, the folder to create, e.g. figures/plots." : "")
  );
}

export function describeManageFiles(withFolders: boolean): string {
  return [
    "Change which files and directories the project's local clone holds, or throw local work away; action picks what.",
    "delete removes a file, or a directory with everything in it. move renames a file or a directory or moves it inside the project, creating missing parent directories and refusing a toPath that already exists or lies inside the directory being moved.",
    "upload adds a file byte for byte, such as a figure, a PDF, a data file or a .bib from elsewhere, copied from sourcePath on this computer or decoded from contentBase64, and replaces a file already at path; edit_file is for text written in the call itself.",
    "upload_folder copies every file under the folder sourcePath into the directory path, keeping its subfolders and replacing files already at those paths; hidden files and folders and symbolic links are left out, and it takes at most 180 files, as Overleaf's upload dialog does.",
    "restore puts a file back to exactly what it was at revision, binary files included, and brings back a file deleted since; find the revision with read_history.",
    "discard_local_changes permanently throws away every local edit, new file and unpushed commit in the project, fetching Overleaf first so the clone ends up matching its current version; call it only once the user has said the work should be abandoned, typically after push_changes refuses a conflicting change.",
    ...(withFolders
      ? [
          "create_folder creates a folder, and any missing parent folders, in Overleaf itself at once, through the session cookie, because Git records files and never folders, so a clone cannot hold an empty one. Co-authors see it immediately and there is no undo here, so confirm with the user first.",
        ]
      : []),
    `Nothing ${withFolders ? "else " : ""}reaches Overleaf until push_changes, and until then discard_local_changes undoes any of these; review them with read_project (view changes).`,
    "LaTeX references are not rewritten: after a move or delete, search_project for the old path and fix what still names it with edit_file.",
    "Uploads over 50 MB and files under a hidden directory such as ~/.ssh are refused. An upload turns off text-only checkout for the project so the new file is committed with the rest, and so does deleting or moving a directory that holds files text-only checkout keeps off disk, so those files go with it.",
    `Every action except discard_local_changes${withFolders ? " and create_folder" : ""} pulls from Overleaf first, and fails, keeping local work, if that pull conflicts with it.`,
    "Returns what was changed, or why nothing was.",
  ].join(" ");
}

/** What the create_folder reply adds when the server also has a clone. */
export const FOLDER_IN_CLONE_NEXT_STEP =
  "The local clone will not show it while it is empty, since Git records only files; a file written or uploaded under it here joins it in Overleaf when push_changes publishes it.";
