import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { EDITS_LOCAL_CLONE } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { expectedRevisionArgument } from "./editFileArguments.js";
import { appendToFileEdit } from "./edits/appendToFileEdit.js";
import { replaceSectionEdit } from "./edits/replaceSectionEdit.js";
import { replaceTextEdit } from "./edits/replaceTextEdit.js";
import { writeWholeFileEdit } from "./edits/writeWholeFileEdit.js";

const EDIT_ACTIONS = ["replace_text", "replace_section", "write", "append"] as const;

const editFileInput = z.object({
  project: projectArgument,
  action: z
    .enum(EDIT_ACTIONS)
    .describe(
      "How to edit: replace_text (an exact snippet), replace_section (a whole section, by title), write (the whole file) or append (add to the end of the file).",
    ),
  path: z
    .string()
    .describe(
      "Every action: path of the file relative to the project root, e.g. sections/intro.tex. Must stay inside the project.",
    ),
  expectedRevision: expectedRevisionArgument,
  findText: z
    .string()
    .optional()
    .describe(
      "replace_text, required: non-empty exact text to find, matched literally including whitespace and newlines. Not a regular expression.",
    ),
  replaceWith: z
    .string()
    .optional()
    .describe("replace_text, required: text to put in its place. An empty string deletes the snippet."),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      "replace_text only: replace every occurrence instead of requiring exactly one match (default false). Only set this when replacing all of them is intended.",
    ),
  sectionTitle: z
    .string()
    .optional()
    .describe(
      "replace_section, required: title of the section to replace, as it appears in the sectioning command. Matched case-insensitively, with a substring fallback; read_project (view outline) lists the titles.",
    ),
  content: z
    .string()
    .optional()
    .describe(
      "replace_section, write and append, required. For replace_section, the section's full replacement, starting with its own sectioning command, e.g. \\section{Introduction} followed by the new body. For write, the complete new contents of the file. For append, the text to add after the file's last line.",
    ),
});

type EditFileInput = z.infer<typeof editFileInput>;

export function registerEditFileTool(server: McpServer, context: ToolContext): void {
  /** Every edit pulls first, so it never lands on a stale copy of a co-author's file. */
  const editSynchronizedClone = (
    project: string | undefined,
    edit: (repository: OverleafGitRepository) => Promise<string>,
  ) =>
    context.projectRegistry.withRepository(project, async (repository) => {
      await requireSynchronizedWithOverleaf(repository);
      return textResult(await edit(repository));
    });

  const actions: Record<(typeof EDIT_ACTIONS)[number], ToolOperation<EditFileInput>> = {
    replace_text: {
      uses: ["findText", "replaceWith", "replaceAll"],
      run: (input) => {
        const findText = requireArgument(input.findText, "findText", "replace_text");
        const replaceWith = requireArgument(input.replaceWith, "replaceWith", "replace_text");
        return editSynchronizedClone(input.project, (repository) =>
          replaceTextEdit(repository, {
            path: input.path,
            expectedRevision: input.expectedRevision,
            findText,
            replaceWith,
            replaceAll: input.replaceAll ?? false,
          }),
        );
      },
    },
    replace_section: {
      uses: ["sectionTitle", "content"],
      run: (input) => {
        const sectionTitle = requireArgument(input.sectionTitle, "sectionTitle", "replace_section");
        const content = requireArgument(input.content, "content", "replace_section");
        return editSynchronizedClone(input.project, (repository) =>
          replaceSectionEdit(repository, {
            path: input.path,
            expectedRevision: input.expectedRevision,
            sectionTitle,
            content,
          }),
        );
      },
    },
    write: {
      uses: ["content"],
      run: (input) => {
        const content = requireArgument(input.content, "content", "write");
        return editSynchronizedClone(input.project, (repository) =>
          writeWholeFileEdit(repository, {
            path: input.path,
            expectedRevision: input.expectedRevision,
            content,
          }),
        );
      },
    },
    append: {
      uses: ["content"],
      run: (input) => {
        const content = requireArgument(input.content, "content", "append");
        return editSynchronizedClone(input.project, (repository) =>
          appendToFileEdit(repository, {
            path: input.path,
            expectedRevision: input.expectedRevision,
            content,
          }),
        );
      },
    },
  };

  server.registerTool(
    "edit_file",
    {
      title: "Edit a file in the local clone",
      description:
        "Change one file in the project's local clone; action picks how. " +
        "replace_text replaces an exact snippet, findText, with replaceWith: findText must match exactly, whitespace and newlines included, and occur once unless replaceAll is set, and replaceWith is inserted literally, so $$, $& and $1 stay as written. Prefer it for a targeted change, since nothing outside the snippet is touched. " +
        "replace_section replaces one whole section of a .tex file, found by sectionTitle as read_file finds it, from its heading to the next heading of the same or a shallower level, never swallowing trailing matter such as \\end{document} or the bibliography; content replaces that range line for line, so it must start with the sectioning command itself or the heading is lost, and should end with a newline to keep the blank line before the next heading. " +
        "write creates the file, with any missing parent directories, or overwrites it entirely with content, exactly as given, as UTF-8, with no trailing newline added; use it for a new file, since for an existing one the other actions cannot drop text you did not mean to rewrite. " +
        "append adds content at the end of an existing file and leaves every line above it untouched: content starts on a new line and is written exactly as given, so end it with a newline to keep one at the end of the file. A missing file is refused, since write is the action that creates one. " +
        "expectedRevision makes any action a guarded edit, refused if the file changed since that read or, for write, no longer exists. " +
        "path must be relative and stay inside the project; absolute paths, .. escapes and the .git directory are refused. " +
        "Pulls from Overleaf first, then edits only the local clone: review the result with read_project (view changes) and publish it with push_changes. " +
        "If the snippet or the section is not found, or the snippet occurs several times without replaceAll, nothing changes and the reply gives the count or lists the section titles. " +
        "Returns what was replaced, written or appended.",
      inputSchema: editFileInput,
      annotations: EDITS_LOCAL_CLONE,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, actions, input, ["project", "action", "path", "expectedRevision"]),
      ),
  );
}
